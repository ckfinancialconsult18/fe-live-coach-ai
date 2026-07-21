/**
 * GET  â€” return the calling user's agency context (their agency if owner, or
 *         the agency they belong to as an agent)
 * POST â€” create a new agency (makes caller the owner + adds them as owner member)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any;

  // Find agency where user is owner OR member
  const { data: membership } = await db
    .from('agency_members')
    .select('role, agency_id, agencies(id, name, owner_id, created_at)')
    .eq('user_id', user.id)
    .single();

  if (!membership) return NextResponse.json({ agency: null, role: null });

  return NextResponse.json({
    agency: membership.agencies,
    role: membership.role,
  });
}

export async function POST(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any;

  const body = await req.json().catch(() => ({})) as { name?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: 'Agency name is required' }, { status: 400 });

  // Check user is not already in an agency
  const { data: existing } = await db
    .from('agency_members')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'You are already part of an agency' }, { status: 409 });

  // Create agency
  const { data: agency, error } = await db
    .from('agencies')
    .insert({ name: body.name.trim(), owner_id: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

  // Add owner as member
  await db.from('agency_members').insert({
    agency_id: agency.id,
    user_id: user.id,
    role: 'owner',
  });

  return NextResponse.json({ agency, role: 'owner' });
}

export async function DELETE() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any;

  const { error } = await db
    .from('agencies')
    .delete()
    .eq('owner_id', user.id);

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
