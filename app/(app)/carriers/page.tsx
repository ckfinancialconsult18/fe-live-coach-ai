import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Carriers' };

const typeLabels: Record<string, string> = {
  final_expense: 'Final Expense',
  mortgage_protection: 'Mortgage Protection',
  term: 'Term',
  whole_life: 'Whole Life',
  universal_life: 'Universal Life',
};

const carrierColors: Record<string, { from: string; to: string }> = {
  'Americo':          { from: '#1e40af', to: '#7c3aed' },
  'Mutual of Omaha':  { from: '#065f46', to: '#0891b2' },
  'Corebridge':       { from: '#92400e', to: '#dc2626' },
  'Transamerica':     { from: '#1e3a8a', to: '#0e7490' },
  'Royal Neighbors':  { from: '#4c1d95', to: '#be185d' },
  'United Home Life': { from: '#14532d', to: '#166534' },
};

export default async function CarriersPage() {
  const supabase = await createClient();
  const { data: carriers } = await supabase.from('carriers').select('*').order('name');
  const list = carriers ?? [];
  const productLineCount = new Set(list.flatMap((c) => c.products)).size;

  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 mb-1">Total Carriers</p>
          <p className="text-2xl font-bold text-slate-200">{list.length}</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 mb-1">Active Contracts</p>
          <p className="text-2xl font-bold text-blue-400">{list.reduce((s, c) => s + c.active_contracts, 0)}</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 mb-1">Product Lines</p>
          <p className="text-2xl font-bold text-green-400">{productLineCount}</p>
        </div>
      </div>

      {/* Carrier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {list.map((carrier) => {
          const colors = carrierColors[carrier.name] ?? { from: '#1e3a8a', to: '#4c1d95' };
          return (
            <div key={carrier.id} className="glass-card rounded-2xl overflow-hidden hover:bg-white/9 transition-all duration-200">
              {/* Header gradient */}
              <div
                className="h-16 p-4 flex items-end"
                style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})` }}
              >
                <h3 className="text-lg font-bold text-white">{carrier.name}</h3>
              </div>
              <div className="p-5 space-y-4">
                {/* Contact */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-slate-600">👤</span>
                    <span>{carrier.contact_name ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-slate-600">📧</span>
                    <span className="truncate">{carrier.contact_email ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-slate-600">📞</span>
                    <span>{carrier.agent_support_phone ?? carrier.customer_service_phone ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-slate-600">🌐</span>
                    <span className="text-blue-400">{carrier.website ?? '—'}</span>
                  </div>
                </div>

                {/* Products */}
                <div>
                  <p className="text-xs text-slate-600 uppercase tracking-wide mb-2">Products</p>
                  <div className="flex flex-wrap gap-1.5">
                    {carrier.products.map((product) => (
                      <Badge key={product} variant="info" size="sm">
                        {typeLabels[product] ?? product}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between pt-3 border-t border-white/6">
                  <div className="text-center">
                    <p className="text-xl font-bold text-slate-200">{carrier.active_contracts}</p>
                    <p className="text-xs text-slate-600">Active Contracts</p>
                  </div>
                  <div className="h-8 w-px bg-white/8" />
                  <div className="text-sm text-slate-400 max-w-[160px]">
                    <p className="text-xs text-slate-600 mb-1">Notes</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{carrier.notes ?? '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="text-sm text-slate-600 col-span-full text-center py-12">No carriers added yet</p>
        )}
      </div>
    </div>
  );
}
