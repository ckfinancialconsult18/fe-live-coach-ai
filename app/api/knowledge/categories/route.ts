import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser, requireFields, handleApiError } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data, error } = await supabase.from('knowledge_categories').select('*').order('name');
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  try {
    const body = await request.json();
    requireFields(body, ['name']);
    const { data, error } = await supabase
      .from('knowledge_categories')
      .insert({ user_id: user.id, name: body.name, parent_id: body.parentId ?? null } as never)
      .select()
      .single();
    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    return NextResponse.json({ category: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
