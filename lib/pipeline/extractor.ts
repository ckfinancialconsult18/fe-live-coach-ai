import { getOpenAI } from '@/lib/openai';
import { readAllKnowledge, compactIndex } from '@/lib/knowledge-reader';
import { buildExtractionPrompt } from './prompts';
import { chunkTranscript } from './parser';
import type { ExtractionResult, ExtractedInsight } from './types';

const MAX_WORDS_PER_CHUNK = 3500;

export async function extractInsights(
  transcriptText: string,
  jobId: string
): Promise<ExtractionResult> {
  const today = new Date().toISOString().split('T')[0];
  const knowledge = await readAllKnowledge();
  const index = compactIndex(knowledge);

  const wordCount = transcriptText.split(/\s+/).length;

  if (wordCount <= MAX_WORDS_PER_CHUNK) {
    return extractSingle(transcriptText, jobId, index, today);
  }

  // Long transcript: chunk and merge
  const chunks = chunkTranscript(transcriptText, MAX_WORDS_PER_CHUNK, 200);
  const results = await Promise.all(
    chunks.map((chunk, i) => extractSingle(chunk, `${jobId}_c${i}`, index, today))
  );

  return mergeResults(results, jobId);
}

async function extractSingle(
  text: string,
  jobId: string,
  knowledgeIndex: string,
  today: string
): Promise<ExtractionResult> {
  if (!process.env.OPENAI_API_KEY) {
    return buildDemoResult(jobId, today);
  }

  const openai = getOpenAI();
  const prompt = buildExtractionPrompt(text, knowledgeIndex, today, jobId);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 6000,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';

  let parsed: ExtractionResult & { insights: (ExtractedInsight & { isNew?: boolean })[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`GPT-4o returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    jobId,
    callSummary: parsed.callSummary ?? '',
    callType: parsed.callType ?? 'unknown',
    callOutcome: parsed.callOutcome ?? 'unknown',
    callScore: parsed.callScore ?? 0,
    insights: (parsed.insights ?? []).filter(
      (i) => i.isNew !== false && i.confidence >= 50
    ),
  };
}

function mergeResults(results: ExtractionResult[], jobId: string): ExtractionResult {
  const allInsights: ExtractedInsight[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    for (const insight of r.insights) {
      // Deduplicate by summary similarity across chunks
      const key = insight.summary.toLowerCase().replace(/\W+/g, '').slice(0, 60);
      if (!seen.has(key)) {
        seen.add(key);
        allInsights.push(insight);
      }
    }
  }

  const primary = results[0];
  return {
    jobId,
    callSummary: primary.callSummary,
    callType: primary.callType,
    callOutcome: primary.callOutcome,
    callScore: primary.callScore,
    insights: allInsights.slice(0, 40),
  };
}

function buildDemoResult(jobId: string, today: string): ExtractionResult {
  return {
    jobId,
    callSummary:
      'Demo mode — no OpenAI API key configured. This is a simulated extraction showing what the pipeline produces for a typical final expense sales call.',
    callType: 'sales',
    callOutcome: 'follow_up',
    callScore: 62,
    insights: [
      {
        type: 'medication',
        targetFile: 'medications',
        section: 'Diabetes Medications',
        summary: 'Metformin (oral T2D) — Americo Eagle preferred carrier',
        content:
          'Prospect on Metformin-only management for Type 2 Diabetes. No insulin. This is the most favorable diabetic profile in the FE market.',
        evidence:
          'PROSPECT: "I have type 2 diabetes, been managing it for about ten years with Metformin."',
        confidence: 97,
        tags: ['metformin', 'diabetes', 'type2', 'americo', 'underwriting'],
        markdownEntry: `---\n**Learned:** ${today} | **Source:** Job ${jobId} | **Confidence:** 97%\n\n**Summary:** Metformin-only T2D management — level benefit available, Americo Eagle preferred.\n\n**Evidence:**\n> PROSPECT: "I have type 2 diabetes, been managing it for about ten years with Metformin."\n\n**Coaching Note:** When a prospect confirms oral-only diabetes management with no insulin, immediately lead with Americo Eagle. Do not over-qualify — this profile qualifies for level benefit at most carriers.\n\n---`,
      },
      {
        type: 'buying_signal',
        targetFile: 'buying_signals',
        section: 'Strong Signals',
        summary: "Neighbor's funeral cost surfaced as double buying signal",
        content:
          'Prospect volunteered a neighbor death story AND the funeral cost AND stated she does not want to burden her kids — a triple buying signal sequence. Agent should close immediately after this.',
        evidence:
          "PROSPECT: \"My neighbor just passed and it cost over twelve thousand dollars. I don't want to leave that burden on my kids.\"",
        confidence: 96,
        tags: ['burden', 'family', 'funeral-cost', 'neighbor-death', 'buying-signal'],
        markdownEntry: `---\n**Learned:** ${today} | **Source:** Job ${jobId} | **Confidence:** 96%\n\n**Summary:** Loss story + burden fear = triple buying signal — close immediately.\n\n**Evidence:**\n> PROSPECT: "My neighbor just passed and it cost over twelve thousand dollars. I don't want to leave that burden on my kids."\n\n**Coaching Note:** When a prospect volunteers a loss story, funeral cost, and family burden concern in one breath, stop presenting. Trial close: "That's exactly what this plan prevents. If I could get that covered for less than you're paying now, would you want to get that in place today?"\n\n---`,
      },
      {
        type: 'failed_close',
        targetFile: 'losing_calls',
        section: 'Stall Objection Not Recovered',
        summary: 'Agent accepted "think about it" without probing — missed same-call close',
        content:
          'After a strong triple buying signal sequence, prospect stalled with "I\'d like to think about it." Agent did not attempt recovery. Call ended without a close or a firm callback appointment.',
        evidence:
          'PROSPECT: "I\'d like to think about that. Can I call you back?" AGENT: [call ended]',
        confidence: 94,
        tags: ['think-about-it', 'stall', 'failed-close', 'no-recovery'],
        markdownEntry: `---\n**Learned:** ${today} | **Source:** Job ${jobId} | **Confidence:** 94%\n\n**Summary:** "Think about it" after buying signal — agent failed to probe or recover.\n\n**Evidence:**\n> PROSPECT: "I'd like to think about that. Can I call you back?"\n> AGENT: [accepted the stall without attempting recovery]\n\n**Coaching Note:** Never accept a raw callback from a prospect who just said they don't want to burden their kids. Use the "What Specifically?" probe: "Of course — can I ask what part you'd like to think about? Is it the price, or something about how the plan works?" Then handle the real objection.\n\n---`,
      },
      {
        type: 'personality',
        targetFile: 'personality_profiles',
        section: 'Profile 1: The Protector',
        summary: 'Protector profile — moved to price before emotional close was fully anchored',
        content:
          'Classic Protector prospect: family-first, volunteered concern about burdening kids, warm and relational. Agent identified the emotional driver but moved to price presentation before fully anchoring the emotional urgency.',
        evidence:
          "PROSPECT: \"I don't want to leave that burden on my kids.\" AGENT: [immediately quoted price]",
        confidence: 89,
        tags: ['protector', 'family-first', 'emotional-close', 'premature-price'],
        markdownEntry: `---\n**Learned:** ${today} | **Source:** Job ${jobId} | **Confidence:** 89%\n\n**Summary:** Protector profile — agent correctly identified but moved to price too early.\n\n**Evidence:**\n> PROSPECT: "I don't want to leave that burden on my kids."\n> AGENT: [moved directly to price quote]\n\n**Coaching Note:** With Protectors, stay in the emotional layer longer. Ask: "How would you feel knowing your daughter never had to worry about this?" Get the answer. Then and only then pivot to the product. Presenting price before emotional close is anchored consistently loses Protectors to the stall.\n\n---`,
      },
    ],
  };
}
