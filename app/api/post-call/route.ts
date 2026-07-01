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
    : { talkPct: 0, listenPct: 0, questionsAskedCount: 0 };

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
