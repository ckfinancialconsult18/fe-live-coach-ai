import type { ExtractedInsight, PendingKnowledgeEntry, PendingEntryIndex } from './types';
import { readAllKnowledge } from '@/lib/knowledge-reader';

const DUPLICATE_THRESHOLD = 0.78;
const SIMILAR_THRESHOLD = 0.52;

/** Jaccard coefficient on meaningful words (length > 3). */
function jaccard(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const setA = tok(a);
  const setB = tok(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  return inter / (setA.size + setB.size - inter);
}

function insightText(insight: ExtractedInsight): string {
  return `${insight.summary} ${insight.content} ${insight.evidence}`;
}

export async function deduplicateInsights(
  insights: ExtractedInsight[],
  existingPendingIndex: PendingEntryIndex[]
): Promise<{
  insight: ExtractedInsight;
  isDuplicate: boolean;
  similarTo: string[];
  conflictsWith: string[];
}[]> {
  // Load knowledge files for comparison
  const knowledge = await readAllKnowledge();
  const knowledgeChunks = buildKnowledgeChunks(knowledge);

  return insights.map((insight) => {
    const text = insightText(insight);
    const similarTo: string[] = [];
    const conflictsWith: string[] = [];

    // Check against existing knowledge files
    let isDuplicate = false;
    for (const chunk of knowledgeChunks) {
      const sim = jaccard(text, chunk);
      if (sim >= DUPLICATE_THRESHOLD) {
        isDuplicate = true;
        break;
      }
    }

    // Check against pending entries of same type
    for (const entry of existingPendingIndex) {
      if (entry.type !== insight.type) continue;
      const sim = jaccard(text, `${entry.summary} ${entry.tags.join(' ')}`);
      if (sim >= DUPLICATE_THRESHOLD) {
        isDuplicate = true;
        break;
      }
      if (sim >= SIMILAR_THRESHOLD && !isDuplicate) {
        similarTo.push(entry.id);
      }
    }

    return { insight, isDuplicate, similarTo, conflictsWith };
  });
}

function buildKnowledgeChunks(knowledge: Record<string, string>): string[] {
  const chunks: string[] = [];
  for (const content of Object.values(knowledge)) {
    if (!content) continue;
    // Split on section boundaries and entry separators
    const sections = content.split(/\n---\n|\n##+ /).filter((s) => s.trim().length > 50);
    chunks.push(...sections.map((s) => s.trim()));
  }
  return chunks;
}

/** Compute similarity score between two pending entries for merge suggestions. */
export function computeSimilarity(a: PendingKnowledgeEntry, b: PendingKnowledgeEntry): number {
  if (a.type !== b.type) return 0;
  return jaccard(insightText(a as unknown as ExtractedInsight), insightText(b as unknown as ExtractedInsight));
}
