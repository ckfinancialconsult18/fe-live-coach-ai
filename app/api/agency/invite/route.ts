/**
 * POST — create an invite link (owner only)
 * GET  — validate an invite token (anyone authenticated)
 * PUT  — accept an invite (authenticated user, not already in an agency)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function POST(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any;

  const body = await req.json().catch(() => ({})) as { email?: string };

  const { data: agency } = await db.from('agencies').select('id').eq('owner_id', user.id).single();
  if (!agency) return NextResponse.json({ error: 'You must create an agency first' }, { status: 403 });

  const { data: invite, error } = await db
    .from('agency_invites')
    .insert({
      agency_id: agency.id,
      invited_by: user.id,
      email: body.email?.trim() || null,
    })
    .select('token, expires_at, email')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return NextResponse.json({
    token: invite.token,
    link: `${baseUrl}/join?token=${invite.token}`,
    expiresAt: invite.expires_at,
    email: invite.email,
  });
}

export async function GET(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any;

  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const { data: invite } = await db
    .from('agency_invites')
    .select('id, agency_id, used_at, expires_at, agencies(id, name, owner_id)')
    .eq('token', token)
    .single();

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.used_at) return NextResponse.json({ error: 'This invite has already been used' }, { status: 410 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'This invite has expired' }, { status: 410 });

  return NextResponse.json({ valid: true, agency: invite.agencies });
}

export async function PUT(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any;

  const body = await req.json().catch(() => ({})) as { token?: string };
  if (!body.token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  // Already in an agency?
  const { data: existing } = await db
    .from('agency_members')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'You are already part of an agency' }, { status: 409 });

  // Validate invite
  const { data: invite } = await db
    .from('agency_invites')
    .select('id, agency_id, used_at, expires_at')
    .eq('token', body.token)
    .single();

  if (!invite) return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
  if (invite.used_at) return NextResponse.json({ error: 'This invite has already been used' }, { status: 410 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'This invite has expired' }, { status: 410 });

  // Add to agency
  const { error: memberError } = await db.from('agency_members').insert({
    agency_id: invite.agency_id,
    user_id: user.id,
    role: 'agent',
  });
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  // Mark invite used
  await db.from('agency_invites').update({ used_by: user.id, used_at: new Date().toISOString() }).eq('id', invite.id);

  return NextResponse.json({ ok: true, agency_id: invite.agency_id });
}
