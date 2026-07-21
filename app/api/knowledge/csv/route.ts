export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import { normalizeText } from '@/lib/rag/chunk';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQuote = false;
    let cur = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (c === ',' && !inQuote) {
        cols.push(cur); cur = '';
      } else {
        cur += c;
      }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

function csvToText(rows: string[][]): string {
  if (!rows.length) return '';
  const header = rows[0];
  // Combine each row as "Header: Value" pairs for readability
  return rows.slice(1).map((row) =>
    header.map((h, i) => `${h}: ${row[i] ?? ''}`).join('\n')
  ).join('\n\n');
}

export async function POST(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    return NextResponse.json({ error: 'Only CSV files are accepted' }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'CSV too large (max 5 MB)' }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 422 });

  const rawText = normalizeText(csvToText(rows));
  const title = String(formData.get('title') ?? file.name);
  const sourceType = 'csv_data';
  const categoryId = formData.get('categoryId') ? String(formData.get('categoryId')) : null;
  const tags = String(formData.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean);

  const db = supabase as any;

  const storagePath = `${user.id}/${crypto.randomUUID()}-${file.name}`;
  await supabase.storage.from('knowledge').upload(storagePath, file, { contentType: 'text/csv', upsert: false });

  const { data: doc, error } = await db
    .from('knowledge_documents')
    .insert({
      user_id: user.id,
      title,
      source_type: sourceType,
      storage_path: storagePath,
      mime_type: 'text/csv',
      file_size: file.size,
      raw_text: rawText,
      status: 'processing',
      category_id: categoryId,
      tags,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

  await db.from('embedding_queue').insert({
    user_id: user.id,
    target_type: 'knowledge_document',
    target_id: doc.id,
  });

  return NextResponse.json({ document: doc });
}
