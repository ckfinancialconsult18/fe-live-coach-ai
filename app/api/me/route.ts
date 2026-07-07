import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

const PROFILE_FIELDS = [
  'full_name', 'email', 'role', 'avatar_url', 'agency_logo_url', 'phone',
  'license_number', 'bio', 'default_state', 'agency_name',
  'agency_phone', 'agency_email', 'agency_website', 'agency_tax_id',
  'agency_address', 'agency_city', 'agency_state',
  'notification_preferences', 'ai_preferences', 'coaching_preferences',
].join(', ');

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: profileRaw } = await supabase
    .from('users')
    .select(PROFILE_FIELDS)
    .eq('id', user.id)
    .single();
  const profile = profileRaw as Record<string, unknown> | null;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

  const [{ data: calls, count: callsToday }, { count: apptsToday }, { data: scores }] = await Promise.all([
    supabase.from('calls').select('outcome', { count: 'exact' }).gte('started_at', todayStart).lte('started_at', todayEnd),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('start_time', todayStart).lte('start_time', todayEnd).eq('status', 'scheduled'),
    supabase.from('call_scores').select('overall_score').gte('created_at', todayStart),
  ]);

  const avgScore = scores?.length
    ? Math.round(scores.reduce((s, c) => s + (c.overall_score ?? 0), 0) / scores.length)
    : null;
  const policiesToday = (calls ?? []).filter((c) => c.outcome === 'policy_written').length;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: profile?.full_name ?? null,
      role: profile?.role ?? 'agent',
      avatarUrl: profile?.avatar_url ?? null,
      agencyLogoUrl: profile?.agency_logo_url ?? null,
      phone: profile?.phone ?? null,
      licenseNumber: profile?.license_number ?? null,
      bio: profile?.bio ?? null,
      defaultState: profile?.default_state ?? null,
      agencyName: profile?.agency_name ?? null,
      agencyPhone: profile?.agency_phone ?? null,
      agencyEmail: profile?.agency_email ?? null,
      agencyWebsite: profile?.agency_website ?? null,
      agencyTaxId: profile?.agency_tax_id ?? null,
      agencyAddress: profile?.agency_address ?? null,
      agencyCity: profile?.agency_city ?? null,
      agencyState: profile?.agency_state ?? null,
      notificationPreferences: (profile?.notification_preferences ?? {}) as Record<string, boolean>,
      aiPreferences: (profile?.ai_preferences ?? {}) as Record<string, unknown>,
      coachingPreferences: (profile?.coaching_preferences ?? {}) as Record<string, unknown>,
    },
    todayStats: {
      calls: callsToday ?? 0,
      appointments: apptsToday ?? 0,
      policiesWritten: policiesToday,
      avgScore,
    },
  });
}

// ── PATCH /api/me — update profile fields ─────────────────────────────────────

interface ProfilePatchBody {
  fullName?: string;
  phone?: string;
  licenseNumber?: string;
  bio?: string;
  defaultState?: string;
  agencyName?: string;
  agencyPhone?: string;
  agencyEmail?: string;
  agencyWebsite?: string;
  agencyTaxId?: string;
  agencyAddress?: string;
  agencyCity?: string;
  agencyState?: string;
  avatarUrl?: string | null;
  agencyLogoUrl?: string | null;
  notificationPreferences?: Record<string, boolean>;
  aiPreferences?: Record<string, unknown>;
  coachingPreferences?: Record<string, unknown>;
}

export async function PATCH(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  let body: ProfilePatchBody;
  try {
    body = await req.json() as ProfilePatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Only allow whitelisted fields — never let users change id, role, or email here
  const update: Record<string, unknown> = {};
  if (body.fullName   !== undefined) update.full_name     = body.fullName.trim().slice(0, 200);
  if (body.phone      !== undefined) update.phone         = body.phone.trim().slice(0, 30);
  if (body.licenseNumber !== undefined) update.license_number = body.licenseNumber.trim().slice(0, 50);
  if (body.bio        !== undefined) update.bio           = body.bio.trim().slice(0, 1000);
  if (body.defaultState !== undefined) update.default_state = body.defaultState.trim().slice(0, 50);
  if (body.agencyName !== undefined) update.agency_name   = body.agencyName.trim().slice(0, 200);
  if (body.agencyPhone !== undefined) update.agency_phone = body.agencyPhone.trim().slice(0, 30);
  if (body.agencyEmail !== undefined) update.agency_email = body.agencyEmail.trim().slice(0, 200);
  if (body.agencyWebsite !== undefined) update.agency_website = body.agencyWebsite.trim().slice(0, 200);
  if (body.agencyTaxId !== undefined) update.agency_tax_id = body.agencyTaxId.trim().slice(0, 20);
  if (body.agencyAddress !== undefined) update.agency_address = body.agencyAddress.trim().slice(0, 300);
  if (body.agencyCity !== undefined) update.agency_city   = body.agencyCity.trim().slice(0, 100);
  if (body.agencyState !== undefined) update.agency_state = body.agencyState.trim().slice(0, 50);
  if (body.avatarUrl      !== undefined) update.avatar_url       = body.avatarUrl;
  if (body.agencyLogoUrl  !== undefined) update.agency_logo_url  = body.agencyLogoUrl;
  if (body.notificationPreferences !== undefined) update.notification_preferences = body.notificationPreferences;
  if (body.aiPreferences !== undefined) update.ai_preferences = body.aiPreferences;
  if (body.coachingPreferences !== undefined) update.coaching_preferences = body.coachingPreferences;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error } = await (supabase as any)
    .from('users')
    .update(update)
    .eq('id', user.id);

  if (error) {
    console.error('[PATCH /api/me] update failed:', error.message);
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
