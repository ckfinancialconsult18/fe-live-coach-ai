import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { COACH_SYSTEM_PROMPT, UNDERWRITING_EXTRACT_PROMPT, STAGE_DETECTION_PROMPT } from '@/lib/coach-prompts';
import { requireUser } from '@/lib/api/guard';
import { retrieveRelevantChunks, formatChunksForPrompt } from '@/lib/rag/retrieve';
import { applyAdaptiveWeights, logRetrieval } from '@/lib/rag/weights';
import { checkRateLimit, coachLimiter, interimCoachLimiter } from '@/lib/rate-limit';

const VALID_STAGES = ['introduction', 'permission', 'discovery', 'health', 'budget', 'close'];

// Build a concise system-level directive from the user's saved AI preferences.
function buildPreferencesDirective(prefs: Record<string, unknown>): string {
  const lines: string[] = [];

  const style = prefs.coaching_style as string | undefined;
  if (style === 'supportive') {
    lines.push('COACHING STYLE: Be encouraging and positive. Lead with what the agent did well before offering improvements. Use warm, affirming language.');
  } else if (style === 'direct') {
    lines.push('COACHING STYLE: Be direct and concise. Skip praise — give the most actionable correction or next move immediately. No sugarcoating.');
  } else {
    lines.push('COACHING STYLE: Balanced — briefly acknowledge what\'s working, then give one clear improvement or next move.');
  }

  const detail = prefs.response_detail as string | undefined;
  if (detail === 'detailed') {
    lines.push('RESPONSE DETAIL: Provide full explanations in "recommendedResponse", "whyThisWorks", and "nextBestQuestion" — include the reasoning, not just the script line.');
  } else {
    lines.push('RESPONSE DETAIL: Keep "recommendedResponse" and "nextBestQuestion" to 1–2 sentences each. Be tight.');
  }

  const focuses: string[] = [];
  if (prefs.focus_objections)       focuses.push('objection handling');
  if (prefs.focus_closing)          focuses.push('closing techniques');
  if (prefs.focus_rapport)          focuses.push('rapport building');
  if (prefs.focus_needs_assessment) focuses.push('needs assessment');
  if (prefs.focus_product_knowledge) focuses.push('product and carrier knowledge');
  if (focuses.length) {
    lines.push(`FOCUS AREAS: Prioritize coaching around ${focuses.join(', ')}. When multiple observations are possible, surface the one most relevant to these areas.`);
  }

  return lines.join('\n');
}

// Fast keyword-based stage inference used to enrich the RAG query before the
// gpt-4o-mini stage detection resolves. Keeps script chunks stage-relevant.
function inferStageKeywords(transcript: string): string {
  const t = transcript.toLowerCase();
  const lines = t.split('\n').slice(-10).join(' ');
  if (/social security|draft date|checking|savings|banking|first payment|approved|coverage amount|benefit amount/.test(lines)) return 'close script final expense';
  if (/authorization|send you a (text|link)|verify your social|background check|run your info/.test(lines)) return 'process script final expense';
  if (/oxygen|dialysis|cancer|alzheimer|heart|kidney|copd|diabetes|smoker|tobacco|medication|prescription|pill/.test(lines)) return 'health walk script final expense';
  if (/who.*protect|drop dead|beneficiary|burial|cremation|existing.*policy|what.*paying|waiting period/.test(lines)) return 'situation script final expense';
  if (/trigger|why.*looking|anything in place|nothing at all|getting back to you|reason.*calling/.test(lines)) return 'reason script final expense';
  if (/getting back|my name is|how are you|is that you|put in charge/.test(lines)) return 'open script final expense';
  return '';
}

function buildChecklist(transcript: string): Record<string, boolean> {
  const lower = transcript.toLowerCase();
  return {
    beneficiary: lower.includes('beneficiary') || lower.includes('who would receive'),
    reason: lower.includes('why') && (lower.includes('interested') || lower.includes('reach out') || lower.includes('fill')),
    existing: lower.includes('existing') || lower.includes('current coverage') || lower.includes('have insurance'),
    funeral: lower.includes('funeral') || lower.includes('burial') || lower.includes('cemetery'),
    health: lower.includes('health') || lower.includes('diabetes') || lower.includes('tobacco') || lower.includes('medication'),
    budget: lower.includes('budget') || lower.includes('afford') || lower.includes('per month') || lower.includes('how much'),
    close: lower.includes('get you started') || lower.includes('go ahead') || lower.includes('set you up') || lower.includes('fill out'),
  };
}

/**
 * Real-time coaching endpoint — streams the model's response as it's
 * generated (OpenAI `stream: true`) rather than waiting for the full
 * completion, so the client gets time-to-first-byte instead of
 * time-to-full-response. Wire protocol: newline-delimited JSON frames —
 * {"t":"delta","d":"<raw token text>"} repeated while the model is
 * generating, then exactly one {"t":"meta",...} frame with the
 * stage/underwriting/checklist (computed concurrently) once both finish, or
 * a single {"t":"full",...} frame for the no-API-key/error fallback path.
 * This is real network-level streaming — not simulated client-side reveal.
 */
export async function POST(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  // Rate limiting: keyed by userId so limits are per-authenticated-user, not per-IP.
  // Interim calls (gpt-4o-mini) get a higher allowance than full confirmed calls.
  const body = await req.json() as {
    transcript: string;
    fullLength: number;
    memory?: Record<string, unknown>;
    lastNBA?: { actionType: string; nextQuestion: string } | null;
    isInterim?: boolean;
    callId?: string | null;
  };
  const limiter = body.isInterim ? interimCoachLimiter : coachLimiter;
  const rl = checkRateLimit(limiter, user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before requesting more coaching.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)),
          'X-RateLimit-Limit': String(limiter.maxRequests),
          'X-RateLimit-Window': String(limiter.windowMs / 1000),
        },
      },
    );
  }

  const { transcript, fullLength: _fullLength, memory, lastNBA, isInterim, callId } = body;
  if (!transcript) return NextResponse.json({ error: 'No transcript' }, { status: 400 });

  const encoder = new TextEncoder();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured. Live coaching requires an OpenAI API key.' },
      { status: 503 }
    );
  }

  // ── Interim mode: skip RAG + side calls, use gpt-4o-mini for <300ms TTFB ───
  // Triggered when Web Speech API partials are available — before the full
  // Deepgram transcript is finalized. Produces the same JSON structure as
  // confirmed analysis so applyInsight() needs no branching.
  if (isInterim) {
    const stream = new ReadableStream({
      async start(controller) {
        const send = (frame: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n'));
        try {
          const interimStream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: COACH_SYSTEM_PROMPT +
                  '\n\nINTERIM MODE: The last line ends with "[speaking]" — the sentence is incomplete. ' +
                  'Focus ONLY on: recommendedResponse, nextBestQuestion, nextBestAction, and detectedObjection (if clearly forming). ' +
                  'Skip discovery/memory/family analysis. Keep your JSON concise.',
              },
              {
                role: 'user',
                content: `knownMemory: ${JSON.stringify(memory ?? {})}${lastNBA ? `\nlastNBA: ${JSON.stringify(lastNBA)}` : ''}\n\nConversation:\n\n${transcript}\n\nRespond in the exact JSON format specified.`,
              },
            ],
            temperature: 0.2,
            max_tokens: 500,
            response_format: { type: 'json_object' },
            stream: true,
          });
          for await (const chunk of interimStream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) send({ t: 'delta', d: delta });
          }
          // Emit a lightweight meta frame — no stage/underwriting changes mid-sentence
          send({ t: 'meta', stage: null, underwriting: {}, checklist: {} });
        } catch (err) {
          console.error('Coach API interim error:', err);
          send({ t: 'error', message: err instanceof Error ? err.message : 'Interim coaching failed' });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
  }

  // ── Confirmed mode: full analysis with RAG + side calls + gpt-4.1 ──────────
  // Load user's AI preferences to personalize coaching style/focus/detail
  const { data: profileRow } = await (supabase as any)
    .from('users')
    .select('ai_preferences')
    .eq('id', user.id)
    .single();
  const aiPrefs: Record<string, unknown> = (profileRow?.ai_preferences as Record<string, unknown>) ?? {};
  const prefsDirective = buildPreferencesDirective(aiPrefs);

  const lastTurns = transcript.split('\n').slice(-6).join('\n');
  // Enrich retrieval query with inferred stage so script chunks for the right
  // stage surface even when the transcript semantics don't match script wording.
  const inferredStage = inferStageKeywords(transcript);
  const ragQuery = inferredStage ? `${inferredStage} ${lastTurns}` : lastTurns;
  const [rawChunks, scriptChunks] = await Promise.all([
    retrieveRelevantChunks(supabase, user.id, ragQuery, { matchCount: 8, minSimilarity: 0.35 }).catch(() => []),
    // Always pull stage-specific script content even at lower similarity
    inferredStage
      ? retrieveRelevantChunks(supabase, user.id, inferredStage, { matchCount: 4, minSimilarity: 0.25 }).catch(() => [])
      : Promise.resolve([]),
  ]);
  // Merge, dedupe by id, keep highest similarity
  const allChunks = [...rawChunks];
  for (const sc of scriptChunks) {
    if (!allChunks.find((c) => c.id === sc.id)) allChunks.push(sc);
  }
  // Re-rank by adaptive weight: docs that have driven policy writes surface first
  const retrievedChunks = await applyAdaptiveWeights(supabase, user.id, allChunks);
  const topChunks = retrievedChunks.slice(0, 6);
  const ragContext = formatChunksForPrompt(topChunks);
  // Fire-and-forget: log retrievals so post-call can credit these docs on a win
  logRetrieval(supabase, user.id, topChunks, callId ?? null, null);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (frame: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n'));

      try {
        // Underwriting + stage run concurrently with the streamed coach call —
        // by the time the coach stream finishes, these are almost always done.
        const sidePromise = Promise.all([
          openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: UNDERWRITING_EXTRACT_PROMPT },
              { role: 'user', content: transcript },
            ],
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
          openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: STAGE_DETECTION_PROMPT },
              { role: 'user', content: transcript },
            ],
            temperature: 0,
            max_tokens: 30,
          }),
        ]);

        const coachModel = process.env.OPENAI_COACH_MODEL ?? 'gpt-4.1';

        const coachStream = await openai.chat.completions.create({
          model: coachModel,
          messages: [
            { role: 'system', content: COACH_SYSTEM_PROMPT },
            ...(prefsDirective
              ? [{ role: 'system' as const, content: `AGENT PREFERENCES — apply these rules to every response this session:\n${prefsDirective}` }]
              : []),
            ...(ragContext
              ? [{ role: 'system' as const, content: `SCRIPT & KNOWLEDGE BASE — This is the agent's own script and objection-handling material for this call. This takes priority over general knowledge.\n\nFor "recommendedResponse", "nextBestQuestion", "closingScript", and "alternativeResponses": pull language DIRECTLY from this script where it applies to the current stage and situation. Quote or closely paraphrase the script lines — do not replace them with generic sales advice when a script line fits.\n\n${ragContext}` }]
              : []),
            {
              role: 'user',
              content: `knownMemory (facts already established this call — do not re-ask these): ${JSON.stringify(memory ?? {})}${lastNBA ? `\n\nlastNBA (your previous coaching turn — do NOT repeat the same actionType or nextQuestion): ${JSON.stringify(lastNBA)}` : ''}\n\nCurrent conversation:\n\n${transcript}\n\nAnalyze this and respond in the exact JSON format specified.`,
            },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
          stream: true,
        });

        for await (const chunk of coachStream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) send({ t: 'delta', d: delta });
        }

        const [underwritingRes, stageRes] = await sidePromise;
        const underwritingText = underwritingRes.choices[0]?.message?.content ?? '{}';
        const stageText = stageRes.choices[0]?.message?.content?.trim() ?? 'introduction';

        let underwriting = {};
        try { underwriting = JSON.parse(underwritingText); } catch { /* keep empty */ }
        const stage = VALID_STAGES.includes(stageText) ? stageText : 'introduction';

        send({
          t: 'meta',
          stage,
          underwriting,
          checklist: buildChecklist(transcript),
          ragSources: topChunks.map((c) => ({ id: c.id, similarity: c.similarity, weight: (c as any).weight ?? 1 })),
        });
      } catch (err) {
        console.error('Coach API streaming error:', err);
        send({ t: 'error', message: err instanceof Error ? err.message : 'Coaching analysis failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
}

