import fs from 'fs/promises';
import path from 'path';
import type {
  PendingKnowledgeEntry,
  PendingEntryIndex,
  KnowledgeFile,
  PipelineStats,
  KnowledgeType,
  SearchResult,
} from './types';
import { appendToKnowledgeFile } from '@/lib/knowledge-reader';
import { generateId } from './queue';

const DATA_DIR = path.join(process.cwd(), 'data', 'pipeline');
const PENDING_DIR = path.join(DATA_DIR, 'pending');
const INDEX_FILE = path.join(DATA_DIR, 'pending-index.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const SEARCH_INDEX_FILE = path.join(DATA_DIR, 'search-index.json');

// File name mapping
const KNOWLEDGE_FILE_NAMES: Record<KnowledgeFile, string> = {
  objection_handbook: 'objections',
  carrier_rules: 'carrier_rules',
  underwriting: 'underwriting',
  medications: 'medications',
  winning_calls: 'winning_calls',
  losing_calls: 'call_transcripts',
  sales_psychology: 'sales_psychology',
  coaching_rules: 'coaching_rules',
  buying_signals: 'buying_signals',
  closing_scripts: 'closing_scripts',
  personality_profiles: 'personality_profiles',
  discovery_questions: 'discovery_questions',
};

async function ensureDirs() {
  await fs.mkdir(PENDING_DIR, { recursive: true });
}

// ── Index ─────────────────────────────────────────────────────────────────────

async function readIndex(): Promise<PendingEntryIndex[]> {
  try {
    return JSON.parse(await fs.readFile(INDEX_FILE, 'utf-8')) as PendingEntryIndex[];
  } catch {
    return [];
  }
}

async function writeIndex(index: PendingEntryIndex[]): Promise<void> {
  await ensureDirs();
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
}

// ── Individual Entry Files ────────────────────────────────────────────────────

async function readEntry(id: string): Promise<PendingKnowledgeEntry | null> {
  try {
    const raw = await fs.readFile(path.join(PENDING_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(raw) as PendingKnowledgeEntry;
  } catch {
    return null;
  }
}

async function writeEntry(entry: PendingKnowledgeEntry): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    path.join(PENDING_DIR, `${entry.id}.json`),
    JSON.stringify(entry, null, 2),
    'utf-8'
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function savePendingEntries(
  entries: Omit<PendingKnowledgeEntry, 'id' | 'createdAt' | 'status'>[]
): Promise<PendingKnowledgeEntry[]> {
  await ensureDirs();
  const index = await readIndex();
  const saved: PendingKnowledgeEntry[] = [];

  for (const e of entries) {
    const entry: PendingKnowledgeEntry = {
      ...e,
      id: generateId(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await writeEntry(entry);
    const indexEntry: PendingEntryIndex = {
      id: entry.id,
      jobId: entry.jobId,
      originalFilename: entry.originalFilename,
      type: entry.type,
      targetFile: entry.targetFile,
      summary: entry.summary,
      confidence: entry.confidence,
      status: entry.status,
      isDuplicate: entry.isDuplicate,
      createdAt: entry.createdAt,
      tags: entry.tags,
    };
    index.push(indexEntry);
    saved.push(entry);
  }

  await writeIndex(index);
  await updateStats();
  return saved;
}

export async function approveEntries(
  ids: string[],
  note?: string
): Promise<{ approved: string[]; failed: string[] }> {
  const approved: string[] = [];
  const failed: string[] = [];
  const reviewedAt = new Date().toISOString();
  const index = await readIndex();

  for (const id of ids) {
    const entry = await readEntry(id);
    if (!entry || entry.status !== 'pending') {
      failed.push(id);
      continue;
    }

    try {
      const fileKey = KNOWLEDGE_FILE_NAMES[entry.targetFile];
      if (fileKey) {
        await appendToKnowledgeFile(fileKey as Parameters<typeof appendToKnowledgeFile>[0], entry.markdownEntry);
      }

      const updated: PendingKnowledgeEntry = {
        ...entry,
        status: 'approved',
        reviewedAt,
        reviewNote: note,
      };
      await writeEntry(updated);

      const idx = index.findIndex((i) => i.id === id);
      if (idx !== -1) index[idx] = { ...index[idx], status: 'approved' };
      approved.push(id);
    } catch {
      failed.push(id);
    }
  }

  await writeIndex(index);
  await updateStats();
  await rebuildSearchIndex();
  return { approved, failed };
}

export async function rejectEntries(
  ids: string[],
  note?: string
): Promise<void> {
  const index = await readIndex();
  const reviewedAt = new Date().toISOString();

  for (const id of ids) {
    const entry = await readEntry(id);
    if (!entry) continue;
    await writeEntry({ ...entry, status: 'rejected', reviewedAt, reviewNote: note });
    const idx = index.findIndex((i) => i.id === id);
    if (idx !== -1) index[idx] = { ...index[idx], status: 'rejected' };
  }

  await writeIndex(index);
  await updateStats();
}

export async function editEntry(
  id: string,
  patch: { content?: string; markdownEntry?: string; summary?: string; note?: string }
): Promise<PendingKnowledgeEntry | null> {
  const entry = await readEntry(id);
  if (!entry) return null;
  const updated: PendingKnowledgeEntry = {
    ...entry,
    ...(patch.content !== undefined && { content: patch.content }),
    ...(patch.markdownEntry !== undefined && { markdownEntry: patch.markdownEntry }),
    ...(patch.summary !== undefined && { summary: patch.summary }),
    reviewNote: patch.note ?? entry.reviewNote,
  };
  await writeEntry(updated);
  // Update index summary
  const index = await readIndex();
  const idx = index.findIndex((i) => i.id === id);
  if (idx !== -1 && patch.summary) index[idx].summary = patch.summary;
  await writeIndex(index);
  return updated;
}

export async function listPendingIndex(
  filter: 'all' | 'pending' | 'approved' | 'rejected' = 'all',
  page = 1,
  pageSize = 50
): Promise<{ entries: PendingEntryIndex[]; total: number }> {
  const index = await readIndex();
  const filtered =
    filter === 'all' ? index : index.filter((e) => e.status === filter);
  const sorted = filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return {
    entries: sorted.slice((page - 1) * pageSize, page * pageSize),
    total: sorted.length,
  };
}

export async function getFullEntry(id: string): Promise<PendingKnowledgeEntry | null> {
  return readEntry(id);
}

export async function getFullEntriesByIds(ids: string[]): Promise<PendingKnowledgeEntry[]> {
  const results = await Promise.all(ids.map(readEntry));
  return results.filter((e): e is PendingKnowledgeEntry => e !== null);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

async function readStats(): Promise<PipelineStats> {
  try {
    return JSON.parse(await fs.readFile(STATS_FILE, 'utf-8')) as PipelineStats;
  } catch {
    return emptyStats();
  }
}

async function updateStats(): Promise<void> {
  const index = await readIndex();
  const stats = emptyStats();

  stats.totalInsightsExtracted = index.length;
  stats.pendingReview = index.filter((e) => e.status === 'pending' && !e.isDuplicate).length;
  stats.approvedTotal = index.filter((e) => e.status === 'approved').length;
  stats.rejectedTotal = index.filter((e) => e.status === 'rejected').length;
  stats.duplicatesSkipped = index.filter((e) => e.isDuplicate).length;

  for (const entry of index) {
    stats.byType[entry.type] = (stats.byType[entry.type] ?? 0) + 1;
    stats.byFile[entry.targetFile] = (stats.byFile[entry.targetFile] ?? 0) + 1;
  }

  // Confidence distribution
  const ranges = [
    { range: '90-100', min: 90, max: 101 },
    { range: '70-89', min: 70, max: 90 },
    { range: '50-69', min: 50, max: 70 },
  ];
  stats.confidenceDistribution = ranges.map(({ range, min, max }) => ({
    range,
    count: index.filter((e) => e.confidence >= min && e.confidence < max).length,
  }));

  // Top entries by type
  const objections = index.filter((e) => e.type === 'objection');
  stats.topObjections = topN(objections.map((e) => e.summary), 5);

  const meds = index.filter((e) => e.type === 'medication');
  stats.topMedications = topN(meds.map((e) => e.summary), 5);

  const signals = index.filter((e) => e.type === 'buying_signal');
  stats.topBuyingSignals = topN(signals.map((e) => e.summary), 5);

  // Recent activity (last 14 days)
  const days: Record<string, { processed: number; approved: number }> = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days[d.toISOString().split('T')[0]] = { processed: 0, approved: 0 };
  }
  for (const e of index) {
    const day = e.createdAt.split('T')[0];
    if (days[day]) days[day].processed++;
    if (e.status === 'approved' && e.createdAt) {
      if (days[day]) days[day].approved++;
    }
  }
  stats.recentActivity = Object.entries(days).map(([date, v]) => ({ date, ...v }));

  await ensureDirs();
  await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
}

export { readStats };

function emptyStats(): PipelineStats {
  return {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    queuedJobs: 0,
    totalTranscripts: 0,
    salesCalls: 0,
    coachingCalls: 0,
    totalInsightsExtracted: 0,
    pendingReview: 0,
    approvedTotal: 0,
    rejectedTotal: 0,
    duplicatesSkipped: 0,
    byType: {},
    byFile: {},
    topObjections: [],
    topMedications: [],
    topBuyingSignals: [],
    confidenceDistribution: [],
    recentActivity: [],
  };
}

function topN(items: string[], n: number): { text: string; count: number }[] {
  const freq: Record<string, number> = {};
  for (const item of items) {
    const key = item.slice(0, 80);
    freq[key] = (freq[key] ?? 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([text, count]) => ({ text, count }));
}

// ── Search ────────────────────────────────────────────────────────────────────

interface SearchIndex {
  terms: Record<string, string[]>; // word → [entryId, ...]
  updatedAt: string;
}

async function readSearchIndex(): Promise<SearchIndex> {
  try {
    return JSON.parse(await fs.readFile(SEARCH_INDEX_FILE, 'utf-8')) as SearchIndex;
  } catch {
    return { terms: {}, updatedAt: new Date().toISOString() };
  }
}

async function rebuildSearchIndex(): Promise<void> {
  const index = await readIndex();
  const approved = index.filter((e) => e.status === 'approved');
  const terms: Record<string, Set<string>> = {};

  for (const entry of approved) {
    const words = `${entry.summary} ${entry.tags.join(' ')} ${entry.type} ${entry.targetFile}`
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);

    for (const word of new Set(words)) {
      if (!terms[word]) terms[word] = new Set();
      terms[word].add(entry.id);
    }
  }

  const serialized: SearchIndex = {
    terms: Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, Array.from(v)])),
    updatedAt: new Date().toISOString(),
  };

  await ensureDirs();
  await fs.writeFile(SEARCH_INDEX_FILE, JSON.stringify(serialized), 'utf-8');
}

export async function searchKnowledge(
  query: string,
  filter?: { status?: string; type?: string; targetFile?: string },
  page = 1,
  pageSize = 30
): Promise<{ results: SearchResult[]; total: number }> {
  const index = await readIndex();

  const queryWords = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);

  if (queryWords.length === 0) {
    const all = index
      .filter((e) => !filter?.status || e.status === filter.status)
      .filter((e) => !filter?.type || e.type === filter.type);
    const entries = await getFullEntriesByIds(
      all.slice((page - 1) * pageSize, page * pageSize).map((e) => e.id)
    );
    return {
      results: entries.map((e) => ({ entry: e, score: 0, matchedFields: [], highlights: {} })),
      total: all.length,
    };
  }

  // Score each entry
  const scored: { id: string; score: number; matchedFields: Set<string> }[] = [];

  for (const entry of index) {
    if (filter?.status && entry.status !== filter.status) continue;
    if (filter?.type && entry.type !== filter.type) continue;

    const fields: Record<string, string> = {
      summary: entry.summary,
      tags: entry.tags.join(' '),
      type: entry.type,
      file: entry.targetFile,
    };

    let score = 0;
    const matchedFields = new Set<string>();

    for (const word of queryWords) {
      for (const [field, text] of Object.entries(fields)) {
        if (text.toLowerCase().includes(word)) {
          score += field === 'summary' ? 3 : field === 'tags' ? 2 : 1;
          matchedFields.add(field);
        }
      }
    }

    if (score > 0) scored.push({ id: entry.id, score, matchedFields });
  }

  scored.sort((a, b) => b.score - a.score);
  const page_ids = scored.slice((page - 1) * pageSize, page * pageSize).map((s) => s.id);
  const entries = await getFullEntriesByIds(page_ids);

  const results: SearchResult[] = entries.map((entry) => {
    const s = scored.find((x) => x.id === entry.id)!;
    return {
      entry,
      score: s.score,
      matchedFields: Array.from(s.matchedFields),
      highlights: highlightEntry(entry, queryWords),
    };
  });

  return { results, total: scored.length };
}

function highlightEntry(
  entry: PendingKnowledgeEntry,
  queryWords: string[]
): Record<string, string> {
  const highlights: Record<string, string> = {};
  const fields: Record<string, string> = {
    summary: entry.summary,
    evidence: entry.evidence,
    content: entry.content,
  };
  for (const [field, text] of Object.entries(fields)) {
    let highlighted = text;
    for (const word of queryWords) {
      const re = new RegExp(`(${word})`, 'gi');
      highlighted = highlighted.replace(re, '**$1**');
    }
    if (highlighted !== text) highlights[field] = highlighted;
  }
  return highlights;
}
