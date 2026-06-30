import fs from 'fs/promises';
import path from 'path';

const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge');

export const KNOWLEDGE_FILES = {
  objections:          'objection_handbook.md',
  buying_signals:      'buying_signals.md',
  medications:         'medications.md',
  underwriting:        'underwriting.md',
  carrier_rules:       'carrier_rules.md',
  closing_scripts:     'closing_scripts.md',
  compliance:          'compliance.md',
  personality_profiles:'personality_profiles.md',
  sales_psychology:    'sales_psychology.md',
  call_transcripts:    'call_transcripts.md',
  winning_calls:       'winning_calls.md',
  coaching_rules:      'coaching_rules.md',
} as const;

export type KnowledgeKey = keyof typeof KNOWLEDGE_FILES;

export async function readKnowledgeFile(key: KnowledgeKey): Promise<string> {
  try {
    return await fs.readFile(path.join(KNOWLEDGE_DIR, KNOWLEDGE_FILES[key]), 'utf-8');
  } catch {
    return '';
  }
}

export async function appendToKnowledgeFile(key: KnowledgeKey, content: string): Promise<void> {
  const filePath = path.join(KNOWLEDGE_DIR, KNOWLEDGE_FILES[key]);
  const existing = await fs.readFile(filePath, 'utf-8').catch(() => '');
  // Strip trailing whitespace / "Last reviewed" footer so we insert before it
  const footerIndex = existing.lastIndexOf('\n---\n\n> Last reviewed');
  const insertBefore = footerIndex > -1 ? footerIndex : existing.length;
  const updated =
    existing.slice(0, insertBefore) +
    '\n\n' + content.trim() +
    '\n' +
    existing.slice(insertBefore);
  await fs.writeFile(filePath, updated, 'utf-8');
}

export async function readAllKnowledge(): Promise<Record<KnowledgeKey, string>> {
  const pairs = await Promise.all(
    (Object.keys(KNOWLEDGE_FILES) as KnowledgeKey[]).map(async (key) => [
      key,
      await readKnowledgeFile(key),
    ])
  );
  return Object.fromEntries(pairs) as Record<KnowledgeKey, string>;
}

/** Returns a compact index (headings only) of each file to keep prompt size manageable. */
export function compactIndex(knowledge: Record<KnowledgeKey, string>): string {
  return (Object.keys(KNOWLEDGE_FILES) as KnowledgeKey[])
    .map((key) => {
      const headings = knowledge[key]
        .split('\n')
        .filter((l) => l.startsWith('#') || l.startsWith('**'))
        .slice(0, 30)
        .join('\n');
      return `=== ${KNOWLEDGE_FILES[key]} ===\n${headings}`;
    })
    .join('\n\n');
}
