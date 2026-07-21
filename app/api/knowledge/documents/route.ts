import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('*, carriers(name), knowledge_categories(name)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

  const documents = (data ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    sourceType: d.source_type,
    status: d.status,
    version: d.version,
    tags: d.tags,
    fileSize: d.file_size,
    mimeType: d.mime_type,
    archived: (d as any).archived ?? false,
    categoryId: (d as any).category_id ?? null,
    carrierName: (d.carriers as unknown as { name: string } | null)?.name ?? null,
    categoryName: (d.knowledge_categories as unknown as { name: string } | null)?.name ?? null,
    createdAt: d.created_at,
  }));

  return NextResponse.json({ documents });
}
