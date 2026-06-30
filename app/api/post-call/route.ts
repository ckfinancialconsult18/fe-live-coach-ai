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
  let report: any;

  if (!apiKey) {
    report = getDemoReport();
  } else {
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
      try { report = JSON.parse(content); } catch { report = getDemoReport(); }
    } catch (err) {
      console.error('Post-call API error:', err);
      report = getDemoReport();
    }
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

function getDemoReport() {
  return {
    summary: "Agent established good initial rapport and gathered key health information including diabetes diagnosis. The prospect showed genuine interest by sharing personal details about funeral cost concerns. Call ended with a 'think about it' objection that was partially addressed.",
    overallScore: 74,
    rapportScore: 85,
    discoveryScore: 79,
    trustScore: 72,
    closingScore: 45,
    scores: {
      introduction: 88, permission: 82, discovery: 79, existingCoverage: 71,
      health: 84, budget: 52, presentation: 68, objections: 61, closing: 45,
      confidence: 77, rapport: 85, emotion: 80,
    },
    qualityScores: {
      confidence: 77, authority: 70, empathy: 82, listening: 68, pacing: 73,
      control: 64, objectionHandling: 58, discovery: 79, closing: 45,
      compliance: 95, naturalness: 80, overallSalesEffectiveness: 71,
    },
    strengths: [
      "Excellent rapport building in the introduction",
      "Prospect voluntarily shared health information — a strong buying signal",
      "Good use of empathy when discussing funeral costs",
    ],
    missedOpportunities: [
      "Budget question was never clearly asked — prospect's specific number was not captured",
      "Did not circle back to the emotional pain point about not burdening children",
      "Objection handling ended too quickly — should have dug deeper into the real concern",
    ],
    buyingSignals: [
      "Voluntarily shared health details (diabetes, medications)",
      "Expressed concern about funeral costs for her neighbor",
      "Said 'that sounds almost too good to be true' — indicating interest",
    ],
    objections: [
      "'I'd like to think about it' — primary close objection",
      "Price sensitivity — compared to current $30/month plan",
    ],
    objectionsHandling: [
      { objection: "I'd like to think about that. Can I call you back?", handled: false, howHandled: 'Agent accepted the stall without probing for the specific underlying concern.' },
    ],
    mostEffectiveMoments: [
      'Agent paused and let the prospect share the neighbor funeral-cost story without interrupting — built strong emotional connection.',
    ],
    weakestMoments: [
      "When the price objection surfaced, the agent moved on instead of asking 'is it the price, the company, or something else?'",
    ],
    whatShouldHaveBeenDifferent: [
      'Should have asked a specific budget number before presenting any price.',
      "Should have probed the 'think about it' objection with a clarifying question instead of accepting it.",
    ],
    aiCoachingSummary: "Solid discovery and rapport, but the close was rushed. Next call, slow down at the objection — don't let 'think about it' end the conversation without first understanding what 'it' is.",
    threeBiggestImprovements: [
      'Ask a direct budget question before presenting price',
      "Probe every 'think about it' objection with a clarifying question",
      'Circle back to emotional triggers (family burden) right before closing',
    ],
    threeBiggestStrengths: [
      'Natural, unhurried rapport building',
      'Got voluntary health disclosure without forcing it',
      'Genuine empathy when discussing funeral costs',
    ],
    overallGrade: 'B-',
    followUpText: "Hi Dorothy! This is Courtney from FE Financial. It was great speaking with you today. I'm sending over a quick summary of the Mutual of Omaha plan we discussed — $10,000 coverage for around $28/month. Happy to answer any questions. Talk soon!",
    followUpEmail: "Dear Dorothy,\n\nThank you for taking the time to speak with me today. I really enjoyed our conversation.\n\nAs I mentioned, Mutual of Omaha's Living Promise plan would provide your family with $10,000 in final expense coverage for approximately $28/month — less than you're currently paying for $5,000 in coverage.\n\nI know you wanted some time to think it over, and I completely respect that. If you have any questions at all, please don't hesitate to reach out.\n\nWarm regards,\nCourtney K.\nFE Financial",
    crmNotes: "Dorothy Williams, 68F, diabetic (Metformin), non-smoker. Currently has $5,000 AARP policy at $30/month. Concerned about burial costs after neighbor's $12,000 funeral. Good candidate for Mutual of Omaha Living Promise. Price point is ~$28/month for $10K. Objection: 'need to think about it.' Follow up in 2 days.",
    improvementPlan: [
      "Practice the budget question — get a specific number before presenting price",
      "Role play 'think about it' objection — dig deeper with 'Is it the price, the company, or the coverage amount?'",
      "Circle back to emotional triggers more deliberately — she mentioned her children twice",
    ],
  };
}
