import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: clients, error } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 });

  const contactIds = (clients ?? []).map((c) => c.id);
  const { data: policies } = contactIds.length
    ? await supabase.from('policies').select('*').in('contact_id', contactIds)
    : { data: [] as any[] };

  const mapped = (clients ?? []).map((c) => ({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    email: c.email ?? '',
    phone: c.phone ?? '',
    dob: c.dob ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    zip: c.zip ?? '',
    beneficiaries: c.beneficiary_name
      ? [{ id: `${c.id}-b1`, name: c.beneficiary_name, relationship: c.beneficiary_relationship ?? '', percentage: 100 }]
      : [],
    existingCoverage: c.existing_coverage ?? '',
    medicalNotes: c.medical_notes ?? '',
    createdAt: c.created_at,
    policies: (policies ?? []).filter((p) => p.contact_id === c.id).map((p) => p.id),
  }));

  const mappedPolicies = (policies ?? []).map((p: any) => ({
    id: p.id,
    clientId: p.contact_id,
    clientName: '',
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

  return NextResponse.json({ clients: mapped, policies: mappedPolicies });
}
