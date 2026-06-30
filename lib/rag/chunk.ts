/**
 * Intelligent-ish chunking: splits on paragraph boundaries first, then merges
 * paragraphs up to a target size, falling back to hard splits for any single
 * paragraph that exceeds the max on its own. Keeps a small overlap between
 * chunks so retrieval doesn't lose context at a boundary.
 */
const TARGET_CHARS = 1200;
const OVERLAP_CHARS = 150;
const MAX_CHARS = 2000;

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (para.length > MAX_CHARS) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < para.length; i += MAX_CHARS - OVERLAP_CHARS) {
        chunks.push(para.slice(i, i + MAX_CHARS));
      }
      continue;
    }

    if ((current + '\n\n' + para).length > TARGET_CHARS && current) {
      chunks.push(current);
      const tail = current.slice(Math.max(0, current.length - OVERLAP_CHARS));
      current = tail + '\n\n' + para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

/** Rough token estimate (chars/4) — good enough for queue bookkeeping, not billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Strips ASCII control characters (keeps newline and tab) without relying on a regex literal. */
function stripControlChars(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isControl = code <= 31 && code !== 10 && code !== 9; // 10 = \n, 9 = \t
    if (!isControl) out += text[i];
  }
  return out;
}

/** Normalize extracted text before chunking: collapse whitespace, strip control chars. */
export function normalizeText(text: string): string {
  return stripControlChars(text.replace(/\r\n/g, '\n'))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
