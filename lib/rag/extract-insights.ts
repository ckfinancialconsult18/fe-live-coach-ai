import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getOpenAI } from '@/lib/openai';
import { buildExtractionPrompt } from '@/lib/pipeline/prompts';
import { chunkTranscript } from '@/lib/pipeline/parser';
import type { ExtractionResult, ExtractedInsight } from '@/lib/pipeline/types';

const MAX_WORDS_PER_CHUNK = 3500;

/**
 * Supabase-backed replacement for lib/pipeline/extractor.ts's
 * extractInsights(). The original read its deduplication index from local
 * markdown files (lib/knowledge-reader.ts); this version builds the same
 * "existing knowledge" index from the user's own approved knowledge_base
 * rows, so there is no filesystem dependency anywhere in this path.
 */
export async function extractInsightsFromDb(
  supabase: SupabaseClient<Database>,
  userId: string,
  transcriptText: string,
  jobId: string
): Promise<ExtractionResult> {
  const today = new Date().toISOString().split('T')[0];
  const knowledgeIndex = await buildKnowledgeIndex(supabase, userId);

  const wordCount = transcriptText.split(/\s+/).length;
  if (wordCount <= MAX_WORDS_PER_CHUNK) {
    return extractSingle(transcriptText, jobId, knowledgeIndex, today);
  }

  const chunks = chunkTranscript(transcriptText, MAX_WORDS_PER_CHUNK, 200);
  const results = await Promise.all(chunks.map((chunk, i) => extractSingle(chunk, `${jobId}_c${i}`, knowledgeIndex, today)));
  return mergeResults(results, jobId);
}

async function buildKnowledgeIndex(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data } = await supabase
    .from('knowledge_base')
    .select('target_file, section')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .limit(200);

  if (!data || data.length === 0) return '(no existing approved knowledge yet)';

  const byFile = new Map<string, Set<string>>();
  for (const row of data) {
    if (!byFile.has(row.target_file)) byFile.set(row.target_file, new Set());
    if (row.section) byFile.get(row.target_file)!.add(row.section);
  }

  return Array.from(byFile.entries())
    .map(([file, sections]) => `${file}:\n${Array.from(sections).map((s) => `  - ${s}`).join('\n')}`)
    .join('\n\n');
}

async function extractSingle(text: string, jobId: string, knowledgeIndex: string, today: string): Promise<ExtractionResult> {
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
  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Extraction model returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    jobId,
    callSummary: parsed.callSummary ?? '',
    callType: parsed.callType ?? 'unknown',
    callOutcome: parsed.callOutcome ?? 'unknown',
    callScore: parsed.callScore ?? 0,
    insights: (parsed.insights ?? []).filter((i) => i.confidence >= 50),
  };
}

function mergeResults(results: ExtractionResult[], jobId: string): ExtractionResult {
  const allInsights: ExtractedInsight[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    for (const insight of r.insights) {
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
    callSummary: 'Demo mode — no OpenAI API key configured. Add OPENAI_API_KEY to enable real extraction.',
    callType: 'sales',
    callOutcome: 'follow_up',
    callScore: 62,
    insights: [
      {
        type: 'buying_signal',
        targetFile: 'buying_signals',
        section: 'Demo Signal',
        summary: 'Demo insight — configure OPENAI_API_KEY for real extraction',
        content: 'This is placeholder content shown only when no OpenAI API key is configured.',
        evidence: `(demo, job ${jobId})`,
        confidence: 60,
        tags: ['demo'],
        markdownEntry: `Demo entry generated ${today} for job ${jobId}.`,
      },
    ],
  };
}
