import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { POST_CALL_PROMPT } from '@/lib/coach-prompts';
import { createClient } from '@/lib/supabase/server';
import type { TranscriptLine, TimelineEvent } from '@/lib/types';

interface PostCallRequestBody {
  transcript: string;
  transcriptLines?: TranscriptLine[];
  duration?: number;
  metrics?: Record<string, unknown>;
  callId?: string | null;
  timeline?: TimelineEvent[];
}

/** Real, deterministic talk/listen/question metrics — never asked of the model. */
function computeRealMetrics(lines: TranscriptLine[]) {
  const agentWords = lines.filter((l) => l.speaker === 'agent').reduce((s, l) => s + l.text.split(/\s+/).length, 0);
  const prospectWords = lines.filter((l) => l.speaker === 'prospect').reduce((s, l) => s + l.text.split(/\s+/).length, 0);
  const total = agentWords + prospectWords;
  const talkPct = total > 0 ? Math.round((agentWords / total) * 100) : 0;
  const questionsAskedCount = lines.filter((l) => l.speaker === 'agent' && l.text.includes('?')).length;
  return { talkPct, listenPct: 100 - talkPct, questionsAskedCount };
}

async function persistCall(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: PostCallRequestBody,
  report: any
): Promise<string | null> {
  const now = new Date();
  const duration = body.duration ?? 0;
  const startedAt = new Date(now.getTime() - duration * 1000).toISOString();
  const outcome = report.overallScore >= 70 ? 'follow_up' : 'follow_up';

  const callPayload = {
    call_type: 'sales',
    outcome,
    duration_seconds: duration,
    transcript: body.transcriptLines ?? { raw: body.transcript },
    metrics: body.metrics ?? {},
    status: 'completed',
    ended_at: now.toISOString(),
  };

  let callId = body.callId ?? null;

  if (callId) {
    // Finalize an autosaved in-progress row instead of creating a duplicate.
    const { data, error } = await supabase
      .from('calls')
      .update(callPayload as never)
      .eq('id', callId)
      .eq('user_id', userId)
      .select('id')
      .single();
    if (error || !data) callId = null; // fall through to insert if the row didn't exist/wasn't ours
    else callId = data.id;
  }

  if (!callId) {
    const { data, error } = await supabase
      .from('calls')
      .insert({ user_id: userId, started_at: startedAt, ...callPayload } as never)
      .select('id')
      .single();
    if (error || !data) return null;
    callId = data.id;
  }

  await supabase.from('call_scores').upsert({
    user_id: userId,
    call_id: callId,
    overall_score: report.overallScore ?? 0,
    scores: report.scores ?? {},
    quality_scores: report.qualityScores ?? {},
    timeline: body.timeline ?? [],
    report_details: {
      rapportScore: report.rapportScore ?? 0,
      discoveryScore: report.discoveryScore ?? 0,
      trustScore: report.trustScore ?? 0,
      closingScore: report.closingScore ?? 0,
      talkPct: report.talkPct ?? 0,
      listenPct: report.listenPct ?? 0,
      questionsAskedCount: report.questionsAskedCount ?? 0,
      objectionsHandling: report.objectionsHandling ?? [],
      mostEffectiveMoments: report.mostEffectiveMoments ?? [],
      weakestMoments: report.weakestMoments ?? [],
      whatShouldHaveBeenDifferent: report.whatShouldHaveBeenDifferent ?? [],
      aiCoachingSummary: report.aiCoachingSummary ?? '',
      threeBiggestImprovements: report.threeBiggestImprovements ?? [],
      threeBiggestStrengths: report.threeBiggestStrengths ?? [],
      overallGrade: report.overallGrade ?? '',
    },
    strengths: report.strengths ?? [],
    missed_opportunities: report.missedOpportunities ?? [],
    buying_signals: report.buyingSignals ?? [],
    objections: report.objections ?? [],
    summary: report.summary ?? '',
    follow_up_text: report.followUpText ?? '',
    follow_up_email: report.followUpEmail ?? '',
    crm_notes: report.crmNotes ?? '',
    improvement_plan: report.improvementPlan ?? [],
  } as never, { onConflict: 'call_id' });

  return callId;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as PostCallRequestBody;
  if (!body.transcript) return NextResponse.json({ error: 'No transcript' }, { status: 400 });

  const realMetrics = body.transcriptLines?.length
    ? computeRealMetrics(body.transcriptLines)
    : { talkPct: 0, listenPct: 0, questionsAskedCount: 0 };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured. After-call report generation requires an OpenAI API key.' },
      { status: 503 }
    );
  }

  let report: any;
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: POST_CALL_PROMPT },
        {
          role: 'user',
          content: `Real computed metrics (use these exactly, do not recompute): talkPct=${realMetrics.talkPct}, listenPct=${realMetrics.listenPct}, questionsAskedCount=${realMetrics.questionsAskedCount}\n\nFull transcript:\n\n${body.transcript}`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = res.choices[0]?.message?.content ?? '{}';
    try {
      report = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'Failed to parse report from AI response' }, { status: 500 });
    }
  } catch (err) {
    console.error('Post-call API error:', err);
    return NextResponse.json(
      { error: `Failed to generate after-call report: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  // Real numbers always win over whatever the model echoed back.
  report.talkPct = realMetrics.talkPct;
  report.listenPct = realMetrics.listenPct;
  report.questionsAskedCount = realMetrics.questionsAskedCount;

  try {
    const callId = await persistCall(supabase, user.id, body, report);
    if (callId) report.callId = callId;
  } catch (err) {
    console.error('Failed to persist call to Supabase:', err);
  }

  return NextResponse.json(report);
}

