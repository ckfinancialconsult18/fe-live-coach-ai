import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: policies, error } = await supabase
    .from('policies')
    .select('*, contacts(first_name, last_name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to load policies' }, { status: 500 });

  const mapped = (policies ?? []).map((p: any) => ({
    id: p.id,
    clientId: p.contact_id ?? '',
    clientName: p.contacts ? `${p.contacts.first_name} ${p.contacts.last_name}` : 'Unknown',
    type: p.policy_type,
    carrier: p.carrier_name,
    policyNumber: p.policy_number ?? '',
    faceAmount: Number(p.face_amount ?? 0),
    premium: Number(p.premium ?? 0),
    commission: Number(p.commission_amount ?? 0),
    commissionRate: Number(p.commission_rate ?? 0),
    status: p.status,
    effectiveDate: p.effective_date ?? '',
    issueDate: p.issue_date ?? '',
    notes: p.notes ?? '',
  }));

  return NextResponse.json({ policies: mapped });
}
