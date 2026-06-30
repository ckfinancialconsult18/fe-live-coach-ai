import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data, error } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', id)
    .eq('user_id', user.id)
    .order('version', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ versions: data ?? [] });
}
