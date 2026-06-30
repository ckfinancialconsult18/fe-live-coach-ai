import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/server';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from('contacts').select('*').eq('id', id).single();
  if (!client) notFound();

  const [{ data: policies }, { data: appointments }] = await Promise.all([
    supabase.from('policies').select('*').eq('contact_id', id),
    supabase.from('appointments').select('*').eq('contact_id', id).order('start_time', { ascending: false }),
  ]);

  const policyList = policies ?? [];
  const appointmentList = appointments ?? [];
  const age = client.dob ? new Date().getFullYear() - new Date(client.dob).getFullYear() : null;
  const totalPremium = policyList.reduce((s, p) => s + Number(p.premium ?? 0), 0);
  const totalCoverage = policyList.reduce((s, p) => s + Number(p.face_amount ?? 0), 0);
  const beneficiaries = client.beneficiary_name
    ? [{ id: `${client.id}-b1`, name: client.beneficiary_name, relationship: client.beneficiary_relationship ?? '', percentage: 100 }]
    : [];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back */}
      <Link href="/clients" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Clients
      </Link>

      {/* Profile Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-start gap-6 flex-wrap">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/30 to-violet-600/30 border border-white/15 flex items-center justify-center text-2xl font-bold text-slate-200 shrink-0">
            {client.first_name[0]}{client.last_name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-slate-100">{client.first_name} {client.last_name}</h2>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-400">
              <span>📧 {client.email ?? '—'}</span>
              <span>📞 {client.phone ?? '—'}</span>
              <span>📍 {client.address ?? '—'}, {client.city ?? ''}, {client.state ?? ''} {client.zip ?? ''}</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="info">{age !== null ? `Age ${age}` : 'Age —'}</Badge>
              <Badge variant="success">DOB {client.dob ?? '—'}</Badge>
              <Badge variant="default">Client since {client.created_at?.split('T')[0]}</Badge>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-right">
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-slate-500">Total Coverage</p>
              <p className="text-xl font-bold text-green-400">${totalCoverage.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-slate-500">Monthly Premium</p>
              <p className="text-xl font-bold text-blue-400">${totalPremium.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Policies */}
        <Card>
          <CardHeader>
            <CardTitle>Policies</CardTitle>
            <Badge variant="success">{policyList.length} active</Badge>
          </CardHeader>
          <div className="space-y-3">
            {policyList.map((p) => (
              <div key={p.id} className="p-4 rounded-xl bg-white/4 hover:bg-white/7 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-slate-200">{p.carrier_name}</p>
                    <p className="text-xs text-slate-500">{p.policy_number ?? '—'}</p>
                  </div>
                  <Badge variant={p.status === 'issued' ? 'success' : p.status === 'pending' ? 'warning' : 'danger'}>
                    {p.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-600">Type</p>
                    <p className="text-slate-300 capitalize">{p.policy_type.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Face Amount</p>
                    <p className="text-slate-300">${Number(p.face_amount ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Premium</p>
                    <p className="text-slate-300">${p.premium ?? 0}/mo</p>
                  </div>
                </div>
              </div>
            ))}
            {policyList.length === 0 && <p className="text-sm text-slate-600 py-4 text-center">No policies on file</p>}
          </div>
        </Card>

        {/* Beneficiaries */}
        <Card>
          <CardHeader>
            <CardTitle>Beneficiaries</CardTitle>
            <Badge>{beneficiaries.length}</Badge>
          </CardHeader>
          <div className="space-y-3">
            {beneficiaries.map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/4">
                <div className="w-9 h-9 rounded-full bg-violet-500/20 border border-violet-500/20 flex items-center justify-center text-sm">
                  👤
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">{b.name}</p>
                  <p className="text-xs text-slate-500">{b.relationship}</p>
                </div>
                <Badge variant="purple">{b.percentage}%</Badge>
              </div>
            ))}
            {beneficiaries.length === 0 && <p className="text-sm text-slate-600 py-4 text-center">No beneficiaries on file</p>}
          </div>
        </Card>

        {/* Medical Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Medical Notes</CardTitle>
          </CardHeader>
          <div className="p-4 rounded-xl bg-white/4">
            <p className="text-sm text-slate-300">{client.medical_notes || 'No medical notes on file.'}</p>
          </div>
          <div className="mt-4">
            <CardTitle className="mb-3">Existing Coverage</CardTitle>
            <div className="p-4 rounded-xl bg-white/4">
              <p className="text-sm text-slate-300">{client.existing_coverage || 'No existing coverage noted.'}</p>
            </div>
          </div>
        </Card>

        {/* Appointments */}
        <Card>
          <CardHeader>
            <CardTitle>Appointment History</CardTitle>
            <Badge>{appointmentList.length}</Badge>
          </CardHeader>
          <div className="space-y-3">
            {appointmentList.map((a) => (
              <div key={a.id} className="p-3 rounded-xl bg-white/4">
                <p className="text-sm font-medium text-slate-200">{a.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(a.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}
                  <span className="capitalize">{a.type.replace('_', ' ')}</span>
                </p>
              </div>
            ))}
            {appointmentList.length === 0 && (
              <p className="text-sm text-slate-600 py-4 text-center">No appointments on file</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
