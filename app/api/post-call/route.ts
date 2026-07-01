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

function computeRealMetrics(lines: TranscriptLine[]) {
  const agentWords = lines.filter((l) => l.speaker === 'agent').reduce((s, l) => s + l.text.split(/\s+/).length, 0);
  const prospectWords = lines.filter((l) => l.speaker === 'prospect').reduce((s, l) => s + l.text.split(/\s+/).length, 0);
  const total = agentWords + prospectWords;
  const talkPct = total > 0 ? Math.round((agentWords / total) * 100) : 0;
  const questionsAskedCount = lines.filter((l) => l.speaker === 'agent' && l.text.includes('?')).length;
  return { talkPct, listenPct: 100 - talkPct, questionsAskedCount };
}

/**
 * Step 1 of 2: Finalize the calls row unconditionally.
 * This runs BEFORE OpenAI so the call is always persisted even if AI scoring fails.
 * Returns the resolved callId (updated existing row or newly inserted fallback).
 */
async function finalizeCall(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: PostCallRequestBody,
): Promise<string | null> {
  const now = new Date();
  const duration = body.duration ?? 0;
  const startedAt = new Date(now.getTime() - duration * 1000).toISOString();

  const callPayload = {
    call_type: 'sales',
    outcome: 'follow_up' as const,
    duration_seconds: duration,
    transcript: body.transcriptLines ?? [],
    metrics: body.metrics ?? {},
    status: 'completed',
    ended_at: now.toISOString(),
  };

  const incomingCallId = body.callId ?? null;
  console.log('[post-call] finalizeCall → received callId:', incomingCallId, '| userId:', userId, '| lines:', body.transcriptLines?.length ?? 0);

  if (incomingCallId) {
    const { data, error } = await supabase
      .from('calls')
      .update(callPayload as never)
      .eq('id', incomingCallId)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (error) {
      console.error('[post-call] UPDATE calls failed — code:', error.code, '| msg:', error.message, '| hint:', error.hint, '| details:', error.details);
    } else if (data?.id) {
      console.log('[post-call] UPDATE succeeded → callId:', data.id);
      return data.id;
    } else {
      console.warn('[post-call] UPDATE returned no data (0 rows matched id+user_id). callId:', incomingCallId, 'userId:', userId);
    }
  }

  // Fallback: insert a fresh completed row. This happens when:
  // - callId was null (start-call failed or user refreshed mid-call)
  // - UPDATE matched 0 rows (id/user mismatch, row already deleted)
  console.log('[post-call] INSERT fallback → creating new completed calls row');
  const { data: inserted, error: insertError } = await supabase
    .from('calls')
    .insert({ user_id: userId, started_at: startedAt, ...callPayload } as never)
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[post-call] INSERT also failed — code:', insertError?.code, '| msg:', insertError?.message, '| details:', insertError?.details);
    return null;
  }

  console.log('[post-call] INSERT succeeded → new callId:', inserted.id);
  return inserted.id;
}

/**
 * Step 2 of 2: Upsert the AI quality score + full report into call_scores.
 * Only called when OpenAI scoring succeeds.
 */
async function persistScore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  callId: string,
  report: any,
  body: PostCallRequestBody,
): Promise<void> {
  const { error } = await supabase.from('call_scores').upsert({
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

  if (error) {
    console.error('[post-call] call_scores upsert failed — code:', error.code, '| msg:', error.message, '| details:', error.details);
  } else {
    console.log('[post-call] call_scores upserted for callId:', callId, '| score:', report.overallScore);
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) {
    console.error('[post-call] auth failed:', authError?.message);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as PostCallRequestBody;
  if (!body.transcript) return NextResponse.json({ error: 'No transcript' }, { status: 400 });

  const realMetrics = body.transcriptLines?.length
    ? computeRealMetrics(body.transcriptLines)
    : { talkPct: 0, listenPct: 0, questionsAskedCount: 0 };

  // ── Step 1: Finalize the call row immediately ─────────────────────────────
  // This MUST happen before any AI call so the call is never lost if OpenAI
  // fails, times out, or the API key is missing.
  const persistedCallId = await finalizeCall(supabase, user.id, body);

  // ── Step 2: AI scoring (optional — if it fails, the call is still saved) ──
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[post-call] OPENAI_API_KEY not set — call saved without AI score');
    return NextResponse.json({
      callId: persistedCallId,
      _persistError: null,
      _scoreError: 'OPENAI_API_KEY is not configured. The call was saved to Past Calls without an AI score.',
    }, { status: 200 });
  }

  let report: any;
  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_COACH_MODEL ?? 'gpt-4.1',
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
    console.log('[post-call] OpenAI completed, content length:', content.length);
    report = JSON.parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[post-call] OpenAI failed:', msg);
    // Call IS saved. Return 200 with error detail so the UI can display it.
    return NextResponse.json({
      callId: persistedCallId,
      _scoreError: `AI report generation failed: ${msg}. Your call has been saved to Past Calls.`,
    }, { status: 200 });
  }

  // Real metrics always win over whatever the model echoed back.
  report.talkPct = realMetrics.talkPct;
  report.listenPct = realMetrics.listenPct;
  report.questionsAskedCount = realMetrics.questionsAskedCount;

  if (persistedCallId) {
    await persistScore(supabase, user.id, persistedCallId, report, body);
    report.callId = persistedCallId;
  } else {
    report._persistError = 'Call data could not be saved to the database. Check server logs for details.';
  }

  return NextResponse.json(report);
}
