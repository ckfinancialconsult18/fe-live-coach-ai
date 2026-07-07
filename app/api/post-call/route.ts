import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { POST_CALL_PROMPT } from '@/lib/coach-prompts';
import { createClient } from '@/lib/supabase/server';
import { createRateLimiter, checkRateLimit } from '@/lib/rate-limit';
import {
  SCORE_WEIGHTS,
  SCORE_WEIGHT_LABELS,
  scoreToGrade,
  type TranscriptLine,
  type TimelineEvent,
  type WeightedScoreBreakdown,
  type WeightedScoreCategory,
  type ConversationAnalysis,
} from '@/lib/types';

function normalizeScore(raw: number): number {
  if (raw > 0 && raw <= 1)  return Math.round(raw * 100);
  if (raw > 1 && raw <= 10) return Math.round(raw * 10);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function normalizeScoreMap(map: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === 'number') out[k] = normalizeScore(v);
  }
  return out;
}

function computeWeightedScore(
  categoryScores: Record<string, number>,
  categoryExplanations: Record<string, string>,
  scoreExplanation: string,
  reasoning: string,
  confidencePct: number,
): WeightedScoreBreakdown {
  const categories: WeightedScoreCategory[] = [];
  let totalWeighted = 0;

  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    const score = normalizeScore(categoryScores[key] ?? 50);
    const contribution = score * weight;
    totalWeighted += contribution;
    categories.push({
      key,
      label: SCORE_WEIGHT_LABELS[key],
      score,
      weight,
      contribution: Math.round(contribution * 10) / 10,
      grade: scoreToGrade(score),
      explanation: categoryExplanations[key] ?? '',
    });
  }

  const overall = Math.round(totalWeighted);
  return {
    categories,
    overallWeighted: overall,
    grade: scoreToGrade(overall),
    confidencePct: Math.max(0, Math.min(100, Math.round(confidencePct ?? 70))),
    scoreExplanation,
    reasoning,
  };
}

interface PostCallRequestBody {
  transcript: string;
  transcriptLines?: TranscriptLine[];
  duration?: number;
  metrics?: Record<string, unknown>;
  callId?: string | null;
  timeline?: TimelineEvent[];
}

// Post-call analysis is the most expensive OpenAI call in the app — rate-limit
// to 10 per user per hour to prevent quota exhaustion from repeated submissions.
const postCallLimiter = createRateLimiter('post-call', 10, 60 * 60_000);

function computeRealMetrics(lines: TranscriptLine[]) {
  const agentLines = lines.filter((l) => l.speaker === 'agent');
  const prospectLines = lines.filter((l) => l.speaker === 'prospect');

  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  const agentWords = agentLines.reduce((s, l) => s + wordCount(l.text), 0);
  const prospectWords = prospectLines.reduce((s, l) => s + wordCount(l.text), 0);
  const total = agentWords + prospectWords;
  const talkPct = total > 0 ? Math.round((agentWords / total) * 100) : 0;
  const questionsAskedCount = agentLines.filter((l) => l.text.includes('?')).length;

  // Conversation analysis
  const agentTurnCount = agentLines.length;
  const prospectTurnCount = prospectLines.length;
  const agentAvgWordsPerTurn = agentTurnCount > 0 ? Math.round(agentWords / agentTurnCount) : 0;
  const prospectAvgWordsPerTurn = prospectTurnCount > 0 ? Math.round(prospectWords / prospectTurnCount) : 0;
  const agentLongestTurn = agentLines.reduce((mx, l) => Math.max(mx, wordCount(l.text)), 0);
  const prospectLongestTurn = prospectLines.reduce((mx, l) => Math.max(mx, wordCount(l.text)), 0);
  const prospectQuestionCount = prospectLines.filter((l) => l.text.includes('?')).length;

  let talkRatioAssessment: ConversationAnalysis['talkRatioAssessment'] = 'excellent';
  if (talkPct > 75) talkRatioAssessment = 'very_high';
  else if (talkPct > 65) talkRatioAssessment = 'high';
  else if (talkPct > 55) talkRatioAssessment = 'good';

  const conversationAnalysis: ConversationAnalysis = {
    agentWords,
    prospectWords,
    agentTurnCount,
    prospectTurnCount,
    agentAvgWordsPerTurn,
    prospectAvgWordsPerTurn,
    agentLongestTurn,
    prospectLongestTurn,
    agentQuestionCount: questionsAskedCount,
    prospectQuestionCount,
    agentTalkPct: talkPct,
    prospectTalkPct: 100 - talkPct,
    talkRatioAssessment,
    // Sample up to 40 turns for the visual bar chart
    turns: lines.slice(0, 40).map((l) => ({
      speaker: l.speaker as 'agent' | 'prospect',
      words: wordCount(l.text),
      isQuestion: l.text.includes('?'),
    })),
  };

  return { talkPct, listenPct: 100 - talkPct, questionsAskedCount, conversationAnalysis };
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
  const lineCount = body.transcriptLines?.length ?? 0;

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

  console.log('[post-call][1] finalizeCall — callId:', incomingCallId,
    '| userId:', userId,
    '| transcriptLines:', lineCount,
    '| transcriptChars:', body.transcript?.length ?? 0,
    '| duration:', duration + 's',
    '| callId_is_null:', incomingCallId === null);

  // ── Try UPDATE on the existing in-progress row ──────────────────────────────
  if (incomingCallId) {
    console.log('[post-call][2] UPDATE calls — id:', incomingCallId, '| status→completed | transcript lines:', lineCount);

    const { data, error } = await supabase
      .from('calls')
      .update(callPayload as never)
      .eq('id', incomingCallId)
      .eq('user_id', userId)
      .select('id, status, transcript')
      .single();

    if (error) {
      console.error('[post-call][2] UPDATE failed — code:', error.code,
        '| msg:', error.message,
        '| hint:', error.hint,
        '| details:', error.details,
        '| PGRST116=no_rows_found');
    } else if (data?.id) {
      const savedLines = Array.isArray(data.transcript) ? (data.transcript as unknown[]).length : '?';
      console.log('[post-call][2] UPDATE succeeded — callId:', data.id,
        '| status in DB:', data.status,
        '| transcript lines now in DB:', savedLines);
      return data.id;
    } else {
      console.warn('[post-call][2] UPDATE matched 0 rows — callId:', incomingCallId,
        ', userId:', userId, ' — row missing or user_id mismatch');
    }
  }

  // ── INSERT fallback ──────────────────────────────────────────────────────────
  console.log('[post-call][3] INSERT fallback — transcriptLines:', lineCount,
    '| reason:', incomingCallId ? 'UPDATE matched 0 rows' : 'callId was null');

  const { data: inserted, error: insertError } = await supabase
    .from('calls')
    .insert({ user_id: userId, started_at: startedAt, ...callPayload } as never)
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[post-call][3] INSERT also failed — code:', insertError?.code,
      '| msg:', insertError?.message,
      '| details:', insertError?.details);
    return null;
  }

  console.log('[post-call][3] INSERT succeeded — new callId:', inserted.id, '| transcriptLines:', lineCount);
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
  const upsertPayload = {
    user_id: userId,
    call_id: callId,
    overall_score: report.overallScore ?? 0,
    scores: normalizeScoreMap(report.scores ?? {}),
    quality_scores: normalizeScoreMap(report.qualityScores ?? {}),
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
      weightedBreakdown: report.weightedBreakdown ?? null,
      conversationAnalysis: report.conversationAnalysis ?? null,
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
  };

  console.log('[post-call][5] call_scores UPSERT — callId:', callId,
    '| overall_score:', upsertPayload.overall_score,
    '| strengths:', upsertPayload.strengths.length,
    '| objections:', upsertPayload.objections.length,
    '| buying_signals:', upsertPayload.buying_signals.length,
    '| improvement_plan items:', Array.isArray(upsertPayload.improvement_plan) ? upsertPayload.improvement_plan.length : typeof upsertPayload.improvement_plan);

  const { error } = await supabase
    .from('call_scores')
    .upsert(upsertPayload as never, { onConflict: 'call_id' });

  if (error) {
    console.error('[post-call][5] call_scores UPSERT failed — code:', error.code,
      '| msg:', error.message,
      '| details:', error.details,
      '| hint:', error.hint);
  } else {
    console.log('[post-call][5] call_scores UPSERT succeeded — callId:', callId,
      '| score:', upsertPayload.overall_score);
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) {
    console.error('[post-call][0] auth failed:', authError?.message);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = checkRateLimit(postCallLimiter, user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many post-call analyses. Please wait before submitting another.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const body = await req.json() as PostCallRequestBody;

  console.log('[post-call][0] POST received — userId:', user.id,
    '| callId:', body.callId ?? 'null',
    '| transcriptLines:', body.transcriptLines?.length ?? 0,
    '| transcriptChars:', body.transcript?.length ?? 0,
    '| duration:', body.duration ?? 0,
    '| timeline events:', body.timeline?.length ?? 0);

  if (!body.transcript) {
    console.error('[post-call][0] rejected — no transcript field in body');
    return NextResponse.json({ error: 'No transcript' }, { status: 400 });
  }

  const realMetrics = body.transcriptLines?.length
    ? computeRealMetrics(body.transcriptLines)
    : { talkPct: 0, listenPct: 0, questionsAskedCount: 0, conversationAnalysis: undefined };

  console.log('[post-call][0] computed metrics — talkPct:', realMetrics.talkPct,
    '| listenPct:', realMetrics.listenPct,
    '| questions:', realMetrics.questionsAskedCount);

  // ── Step 1: Finalize the call row immediately ─────────────────────────────
  const persistedCallId = await finalizeCall(supabase, user.id, body);

  console.log('[post-call][4] finalizeCall result — persistedCallId:', persistedCallId ?? 'NULL (DB write failed)');

  // ── Step 2: AI scoring ────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[post-call][4] OPENAI_API_KEY not set — call saved without AI score');
    return NextResponse.json({
      callId: persistedCallId,
      _persistError: null,
      _scoreError: 'OPENAI_API_KEY is not configured. The call was saved to Past Calls without an AI score.',
    }, { status: 200 });
  }

  const model = process.env.OPENAI_COACH_MODEL ?? 'gpt-4.1';
  console.log('[post-call][4] OpenAI request — model:', model,
    '| transcriptChars:', body.transcript.length);

  let report: any;
  try {
    const res = await openai.chat.completions.create({
      model,
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
    console.log('[post-call][4] OpenAI succeeded — content length:', content.length,
      '| finish_reason:', res.choices[0]?.finish_reason);
    report = JSON.parse(content);
    console.log('[post-call][4] report parsed — overallScore:', report.overallScore,
      '| summary length:', report.summary?.length ?? 0,
      '| strengths:', report.strengths?.length ?? 0,
      '| objections:', report.objections?.length ?? 0,
      '| buyingSignals:', report.buyingSignals?.length ?? 0,
      '| improvementPlan:', Array.isArray(report.improvementPlan) ? report.improvementPlan.length : typeof report.improvementPlan);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[post-call][4] OpenAI failed — error:', msg);
    return NextResponse.json({
      callId: persistedCallId,
      _scoreError: `AI report generation failed: ${msg}. Your call has been saved to Past Calls.`,
    }, { status: 200 });
  }

  report.talkPct = realMetrics.talkPct;
  report.listenPct = realMetrics.listenPct;
  report.questionsAskedCount = realMetrics.questionsAskedCount;
  report.conversationAnalysis = realMetrics.conversationAnalysis;

  // Server-side weighted score — overrides any overallScore the AI may have returned
  const weightedBreakdown = computeWeightedScore(
    report.categoryScores ?? {},
    report.categoryExplanations ?? {},
    report.scoreExplanation ?? '',
    report.reasoning ?? '',
    report.confidencePct ?? 70,
  );
  report.weightedBreakdown = weightedBreakdown;
  report.overallScore = weightedBreakdown.overallWeighted;
  report.overallGrade = weightedBreakdown.grade;

  console.log('[post-call][4] weighted score — overall:', weightedBreakdown.overallWeighted,
    '| grade:', weightedBreakdown.grade,
    '| confidence:', weightedBreakdown.confidencePct + '%');

  if (persistedCallId) {
    await persistScore(supabase, user.id, persistedCallId, report, body);
    report.callId = persistedCallId;
  } else {
    console.error('[post-call][5] skipping persistScore — no persisted callId');
    report._persistError = 'Call data could not be saved to the database. Check server logs for details.';
  }

  console.log('[post-call][6] response sent — callId:', report.callId ?? 'none',
    '| _persistError:', report._persistError ?? 'none',
    '| _scoreError:', report._scoreError ?? 'none');

  return NextResponse.json(report);
}
