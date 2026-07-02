import type { ParsedTranscript, TranscriptFormat, TranscriptLine } from './types';

const ZOOM_HEADER = /^(RECORDING & TRANSCRIPT|Zoom\s+Transcript)/i;
const TEAMS_HEADER = /^Microsoft Teams Meeting\s+Transcript/i;
const MEET_HEADER = /^(Participants\s*\n|Google Meet\s+Transcript)/i;

const ZOOM_LINE = /^(\d{2}:\d{2}:\d{2})\s+(.+?):\s+(.+)$/;
const VTT_LINE = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;

export function detectFormat(filename: string): TranscriptFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'docx') return 'docx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'vtt' || filename.toLowerCase().includes('zoom')) return 'zoom';
  if (filename.toLowerCase().includes('teams')) return 'teams';
  if (filename.toLowerCase().includes('meet') || filename.toLowerCase().includes('google')) return 'meet';
  if (ext === 'md') return 'md';
  return 'txt';
}

export async function parseTranscript(
  buffer: Buffer,
  format: TranscriptFormat,
  filename: string
): Promise<ParsedTranscript> {
  switch (format) {
    case 'pdf':   return parsePdf(buffer);
    case 'docx':  return parseDocx(buffer);
    case 'zoom':  return parseZoom(buffer.toString('utf-8'), filename);
    case 'teams': return parseTeams(buffer.toString('utf-8'));
    case 'meet':  return parseMeet(buffer.toString('utf-8'));
    default:      return parsePlainText(buffer.toString('utf-8'), format);
  }
}

async function parsePdf(buffer: Buffer): Promise<ParsedTranscript> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const result = await pdfParse(buffer);
    return parsePlainText(result.text, 'pdf');
  } catch (err) {
    throw new Error(`PDF parsing failed: ${err instanceof Error ? err.message : 'pdf-parse unavailable'}`);
  }
}

async function parseDocx(buffer: Buffer): Promise<ParsedTranscript> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> };
    const result = await mammoth.extractRawText({ buffer });
    return parsePlainText(result.value, 'docx');
  } catch (err) {
    throw new Error(`DOCX parsing failed: ${err instanceof Error ? err.message : 'mammoth unavailable'}`);
  }
}

function parseZoom(text: string, filename: string): ParsedTranscript {
  const lines: TranscriptLine[] = [];

  // VTT / WebVTT format (Zoom cloud recordings)
  if (text.includes('WEBVTT') || VTT_LINE.test(text)) {
    const blocks = text.split(/\n\n+/);
    for (const block of blocks) {
      if (VTT_LINE.test(block)) continue;
      const lineMatch = block.match(/^(.+?):\s*(.+)$/m);
      if (lineMatch) {
        lines.push({ speaker: lineMatch[1].trim(), text: lineMatch[2].trim() });
      }
    }
    return buildParsed(lines, 'zoom', { meetingTitle: filename });
  }

  // Zoom transcript text export
  for (const raw of text.split('\n')) {
    const m = raw.match(ZOOM_LINE);
    if (m) {
      lines.push({ speaker: m[2].trim(), text: m[3].trim(), timestamp: m[1] });
      continue;
    }
    // Fallback: "Speaker: text" pattern
    const simple = raw.match(/^([A-Z][A-Za-z\s]+?):\s+(.+)$/);
    if (simple) lines.push({ speaker: simple[1].trim(), text: simple[2].trim() });
  }

  if (lines.length === 0) return parsePlainText(text, 'zoom');
  return buildParsed(lines, 'zoom', { meetingTitle: filename });
}

function parseTeams(text: string): ParsedTranscript {
  const lines: TranscriptLine[] = [];
  // Teams export: "Speaker Name  0:00\nText content"
  const blocks = text.split(/\n(?=[A-Z])/);
  for (const block of blocks) {
    const headerMatch = block.match(/^(.+?)\s{2,}(\d+:\d+)\s*\n([\s\S]+)/);
    if (headerMatch) {
      lines.push({
        speaker: headerMatch[1].trim(),
        timestamp: headerMatch[2].trim(),
        text: headerMatch[3].trim().replace(/\n/g, ' '),
      });
      continue;
    }
    // Plain "Speaker: text" fallback
    const simple = block.match(/^([A-Z][A-Za-z\s]+?):\s+(.+)/s);
    if (simple) lines.push({ speaker: simple[1].trim(), text: simple[2].trim().replace(/\n/g, ' ') });
  }
  if (lines.length === 0) return parsePlainText(text, 'teams');
  return buildParsed(lines, 'teams');
}

function parseMeet(text: string): ParsedTranscript {
  const lines: TranscriptLine[] = [];
  for (const raw of text.split('\n')) {
    const m = raw.match(/^([A-Z][A-Za-z\s]+?):\s+(.+)$/);
    if (m) lines.push({ speaker: m[1].trim(), text: m[2].trim() });
  }
  if (lines.length === 0) return parsePlainText(text, 'meet');
  return buildParsed(lines, 'meet');
}

function parsePlainText(text: string, format: TranscriptFormat): ParsedTranscript {
  const lines: TranscriptLine[] = [];
  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let currentSpeaker = '';
  let currentText: string[] = [];

  for (const line of rawLines) {
    // Skip headers matching platform patterns
    if (ZOOM_HEADER.test(line) || TEAMS_HEADER.test(line) || MEET_HEADER.test(line)) continue;

    // "AGENT: text" or "PROSPECT: text" or "Speaker Name: text"
    const m = line.match(/^([A-Z][A-Za-z0-9\s_-]{1,40}?):\s+(.+)$/);
    if (m) {
      if (currentSpeaker && currentText.length > 0) {
        lines.push({ speaker: currentSpeaker, text: currentText.join(' ') });
        currentText = [];
      }
      currentSpeaker = m[1].trim();
      currentText = [m[2].trim()];
    } else if (currentSpeaker) {
      currentText.push(line);
    }
  }
  if (currentSpeaker && currentText.length > 0) {
    lines.push({ speaker: currentSpeaker, text: currentText.join(' ') });
  }

  // If no speaker structure found, return text as single block
  if (lines.length === 0) {
    return {
      text: text.trim(),
      lines: [{ speaker: 'UNKNOWN', text: text.trim() }],
      wordCount: countWords(text),
      format,
      metadata: { speakerCount: 1 },
    };
  }

  return buildParsed(lines, format);
}

function buildParsed(
  lines: TranscriptLine[],
  format: TranscriptFormat,
  extra: Partial<ParsedTranscript['metadata']> = {}
): ParsedTranscript {
  const speakers = new Set(lines.map((l) => l.speaker));
  const fullText = lines.map((l) => `${l.speaker}: ${l.text}`).join('\n');

  return {
    text: fullText,
    lines,
    wordCount: countWords(fullText),
    format,
    metadata: {
      speakerCount: speakers.size,
      participants: Array.from(speakers),
      ...extra,
    },
  };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Chunk long transcripts for AI processing (max ~3500 words per chunk with 200-word overlap)
export function chunkTranscript(text: string, maxWords = 3500, overlap = 200): string[] {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end >= words.length) break;
    start = end - overlap;
  }
  return chunks;
}
