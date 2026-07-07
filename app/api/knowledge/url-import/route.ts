export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import { normalizeText } from '@/lib/rag/chunk';

const BLOCKED_HOSTS = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

function stripHtml(html: string): string {
  // Remove scripts/styles wholesale
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Replace block tags with newlines
  text = text.replace(/<\/?(p|div|h[1-6]|li|br|tr|td|th|section|article|header|footer|nav|main|blockquote)[^>]*>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return text;
}

export async function POST(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({})) as {
    url?: string;
    title?: string;
    sourceType?: string;
    categoryId?: string;
    tags?: string[];
  };

  if (!body.url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 });
  }

  if (BLOCKED_HOSTS.test(parsed.hostname)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
  }

  let html = '';
  try {
    const res = await fetch(body.url, {
      headers: { 'User-Agent': 'FELiveCoachBot/1.0 (+https://felifecoach.ai)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: 502 });

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/')) {
      return NextResponse.json({ error: 'URL does not return text content' }, { status: 400 });
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Page too large (max 2 MB)' }, { status: 400 });
    }
    html = new TextDecoder().decode(buf);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fetch failed' }, { status: 502 });
  }

  const rawText = normalizeText(stripHtml(html));
  if (!rawText || rawText.length < 50) {
    return NextResponse.json({ error: 'Could not extract meaningful text from URL' }, { status: 422 });
  }

  const title = body.title || parsed.hostname + parsed.pathname;
  const sourceType = body.sourceType || 'url_import';
  const db = supabase as any;

  const { data: doc, error } = await db
    .from('knowledge_documents')
    .insert({
      user_id: user.id,
      title,
      source_type: sourceType,
      storage_path: null,
      mime_type: 'text/html',
      file_size: html.length,
      raw_text: rawText,
      status: 'processing',
      category_id: body.categoryId ?? null,
      tags: body.tags ?? [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('embedding_queue').insert({
    user_id: user.id,
    target_type: 'knowledge_document',
    target_id: doc.id,
  });

  return NextResponse.json({ document: doc });
}
