import type { ParsedTranscript, TranscriptFormat, TranscriptLine } from './types';

const ZOOM_HEADER = /^(RECORDING & TRANSCRIPT|Zoom\s+Transcript)/i;
const TEAMS_HEADER = /^Microsoft Teams Meeting\s+Transcript/i;
const MEET_HEADER = /^(Participants\s*\n|Google Meet\s+Transcript)/i;

const ZOOM_LINE = /^(\d{2}:\d{2}:\d{2})\s+(.+?):\s+(.+)$/;
const TEAMS_LINE = /^(.+?)\s{2,}(\d+:\d{2})\s*\n([\s\S]*?)(?=\n\S|\n$|$)/gm;
const MEET_LINE = /^([A-Z][a-zA-Z\s]+?):\s*(.+)$/gm;
const VTT_LINE = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;

export function detectFormat(filename: string): TranscriptFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
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
    case 'image': return parseImage(buffer, filename);
    case 'pdf':   return parsePdf(buffer);
    case 'docx':  return parseDocx(buffer);
    case 'zoom':  return parseZoom(buffer.toString('utf-8'), filename);
    case 'teams': return parseTeams(buffer.toString('utf-8'));
    case 'meet':  return parseMeet(buffer.toString('utf-8'));
    default:      return parsePlainText(buffer.toString('utf-8'), format);
  }
}

async function parseImage(buffer: Buffer, filename: string): Promise<ParsedTranscript> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
  const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  const mime = mimeMap[ext] ?? 'image/png';
  const b64 = buffer.toString('base64');

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OpenAI = require('openai').default ?? require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'This is a screenshot of a sales script or coaching material. Extract ALL text exactly as shown, preserving structure, headings, bullet points, and flow. Then provide a clean structured version of the script content below the extracted text. Return plain text only.',
          },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' } },
        ],
      },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('No text could be extracted from the image');
  const words = text.trim().split(/\s+/).length;
  return { text, lines: [], wordCount: words, format: 'image', metadata: { speakerCount: 0 } };
}

async function parsePdf(buffer: Buffer): Promise<ParsedTranscript> {
  // Step 1: try text-layer extraction via pdf-parse (fast, free, no API call)
  let textLayerText = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const result = await pdfParse(buffer);
    textLayerText = (result.text ?? '').trim();
  } catch {
    // pdf-parse failed — fall through to vision OCR
  }

  // If we got meaningful text (> 200 chars) the PDF has a text layer — use it
  if (textLayerText.length > 200) {
    return parsePlainText(textLayerText, 'pdf');
  }

  // Step 2: scanned/image-based PDF — send to GPT-4o vision as a base64 file
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('PDF has no text layer and OPENAI_API_KEY is not set for vision OCR fallback.');
  }
  if (buffer.length > 30 * 1024 * 1024) {
    throw new Error('PDF is too large for vision OCR (max 30 MB). Split the file into smaller sections and re-upload.');
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OpenAI = require('openai').default ?? require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Upload via Files API so we can reference by file_id (works for large PDFs)
  const blob = new Blob([new Uint8Array(buffer)], { type: 'application/pdf' });
  const formFile = new File([blob], 'document.pdf', { type: 'application/pdf' });
  const uploaded = await openai.files.create({ file: formFile, purpose: 'user_data' });

  let text = '';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'This is a carrier brochure or insurance product document. Extract ALL text from every page exactly as shown — including plan names, benefit amounts, eligibility requirements, health questions, premium tables, underwriting criteria, footnotes, and any fine print. Preserve structure (headings, bullet points, tables). Return plain text only.',
            },
            {
              type: 'file' as any,
              file: { file_id: uploaded.id },
            },
          ],
        },
      ],
    });
    text = completion.choices[0]?.message?.content ?? '';
  } finally {
    // Clean up the uploaded file regardless of success/failure
    await openai.files.del(uploaded.id).catch(() => {});
  }

  if (!text.trim()) throw new Error('GPT-4o could not extract text from this PDF. The file may be corrupted or password-protected.');
  return parsePlainText(text, 'pdf');
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
