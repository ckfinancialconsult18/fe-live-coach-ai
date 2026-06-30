import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/server';
import { commissionFromRow } from '@/lib/api/mappers';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export const metadata = { title: 'Commissions' };

export default async function CommissionsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('commissions')
    .select('*')
    .order('month', { ascending: false });

  const commissions = (rows ?? []).map(commissionFromRow);
  const currentMonth = new Date().toISOString().slice(0, 7);

  const paid = commissions.filter((c) => c.status === 'paid');
  const pending = commissions.filter((c) => c.status === 'pending');

  const totalPaid = paid.reduce((s, c) => s + c.amount, 0);
  const totalPending = pending.reduce((s, c) => s + c.amount, 0);
  const totalAll = commissions.reduce((s, c) => s + c.amount, 0);

  // by carrier
  const byCarrier: Record<string, number> = {};
  commissions.forEach((c) => {
    byCarrier[c.carrier] = (byCarrier[c.carrier] ?? 0) + c.amount;
  });

  // by month
  const byMonth: Record<string, number> = {};
  commissions.forEach((c) => {
    byMonth[c.month] = (byMonth[c.month] ?? 0) + c.amount;
  });

  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Earned',  value: fmt(totalAll),     color: 'text-slate-200',  bg: 'bg-white/5',         border: 'border-white/8' },
          { label: 'Paid',          value: fmt(totalPaid),    color: 'text-green-400',  bg: 'bg-green-500/8',     border: 'border-green-500/15' },
          { label: 'Pending',       value: fmt(totalPending), color: 'text-amber-400',  bg: 'bg-amber-500/8',     border: 'border-amber-500/15' },
          { label: 'This Month',    value: fmt(commissions.filter((c) => c.month === currentMonth).reduce((s, c) => s + c.amount, 0)), color: 'text-blue-400', bg: 'bg-blue-500/8', border: 'border-blue-500/15' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-5 border ${s.bg} ${s.border}`}>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* By Carrier */}
        <Card>
          <CardHeader><CardTitle>By Carrier</CardTitle></CardHeader>
          <div className="space-y-3">
            {Object.entries(byCarrier)
              .sort((a, b) => b[1] - a[1])
              .map(([carrier, amount]) => {
                const pct = (amount / totalAll) * 100;
                return (
                  <div key={carrier}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-300">{carrier}</span>
                      <span className="text-sm font-medium text-slate-200">{fmt(amount)}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full">
                      <div
                        className="h-1.5 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>

        {/* By Month */}
        <Card>
          <CardHeader><CardTitle>Monthly Totals</CardTitle></CardHeader>
          <div className="space-y-3">
            {Object.entries(byMonth)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([month, amount]) => {
                const pct = (amount / totalAll) * 100;
                const [y, m] = month.split('-');
                const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                return (
                  <div key={month}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-300">{label}</span>
                      <span className="text-sm font-medium text-slate-200">{fmt(amount)}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full">
                      <div
                        className="h-1.5 bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardHeader><CardTitle>Status Summary</CardTitle></CardHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-green-500/8 border border-green-500/15">
              <p className="text-xs text-slate-500">Paid Commissions</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{fmt(totalPaid)}</p>
              <p className="text-xs text-slate-600 mt-1">{paid.length} transactions</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/15">
              <p className="text-xs text-slate-500">Pending Commissions</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{fmt(totalPending)}</p>
              <p className="text-xs text-slate-600 mt-1">{pending.length} transactions</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Commission table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/8">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Commission History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/6">
                {['Client', 'Carrier', 'Policy #', 'Product', 'Amount', 'Status', 'Paid Date'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {commissions.map((c, i) => (
                <tr key={c.id} className={`border-b border-white/4 hover:bg-white/4 transition-colors ${i % 2 === 0 ? '' : 'bg-white/2'}`}>
                  <td className="px-4 py-3 font-medium text-slate-200">{c.clientName}</td>
                  <td className="px-4 py-3 text-slate-400">{c.carrier}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{c.policyNumber}</td>
                  <td className="px-4 py-3 text-slate-400 capitalize">{c.type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-green-400">{fmt(c.amount)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={c.status === 'paid' ? 'success' : c.status === 'pending' ? 'warning' : 'danger'}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.paidDate ?? '—'}</td>
                </tr>
              ))}
              {commissions.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-600">No commissions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
