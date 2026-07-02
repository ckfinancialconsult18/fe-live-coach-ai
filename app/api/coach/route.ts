import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { COACH_SYSTEM_PROMPT, UNDERWRITING_EXTRACT_PROMPT, STAGE_DETECTION_PROMPT } from '@/lib/coach-prompts';
import { requireUser } from '@/lib/api/guard';
import { retrieveRelevantChunks, formatChunksForPrompt } from '@/lib/rag/retrieve';

// Vercel function timeout — AI/provider calls in this route routinely exceed the
// platform default (10-15s); without this the route 504s mid-generation.
export const maxDuration = 60;

const VALID_STAGES = ['introduction', 'permission', 'discovery', 'existing_coverage', 'health', 'budget', 'presentation', 'objections', 'close'];

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

  const { transcript, memory } = await req.json() as { transcript: string; memory?: Record<string, unknown> };
  if (!transcript) return NextResponse.json({ error: 'No transcript' }, { status: 400 });

  const encoder = new TextEncoder();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured. Live coaching requires an OpenAI API key.' },
      { status: 503 }
    );
  }

  const lastTurns = transcript.split('\n').slice(-6).join('\n');
  const retrievedChunks = await retrieveRelevantChunks(supabase, user.id, lastTurns, { matchCount: 4, minSimilarity: 0.45 }).catch(() => []);
  const ragContext = formatChunksForPrompt(retrievedChunks);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (frame: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n'));

      try {
        // Underwriting + stage run concurrently with the streamed coach call —
        // by the time the coach stream finishes, these are almost always done.
        // Underwriting + stage run concurrently with the main coach stream.
        // gpt-4o-mini is fast enough for these structured extraction tasks.
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

        // GPT-4.1 for the main coaching response — faster and more accurate
        // than gpt-4o for structured JSON reasoning. Falls back to gpt-4o if
        // the env override points to a different model.
        const coachModel = process.env.OPENAI_COACH_MODEL ?? 'gpt-4.1';

        const coachStream = await openai.chat.completions.create({
          model: coachModel,
          messages: [
            { role: 'system', content: COACH_SYSTEM_PROMPT },
            ...(ragContext
              ? [{ role: 'system' as const, content: `Relevant material from this agent's own carrier guides, scripts, and objection-handling docs — prefer this over general knowledge when it applies:\n\n${ragContext}` }]
              : []),
            {
              role: 'user',
              content: `knownMemory (facts already established this call — do not re-ask these): ${JSON.stringify(memory ?? {})}\n\nCurrent conversation:\n\n${transcript}\n\nAnalyze this and respond in the exact JSON format specified.`,
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
          ragSources: retrievedChunks.map((c) => ({ id: c.id, similarity: c.similarity })),
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

