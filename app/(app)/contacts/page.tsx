import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Contacts' };

const statusCls: Record<string, string> = {
  client:    'text-green-400 bg-green-500/10 border-green-500/20',
  lead:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
  inactive:  'text-slate-400 bg-white/5 border-white/10',
};

function formatLastCall(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*')
    .order('updated_at', { ascending: false });

  const list = contacts ?? [];

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Contacts</h2>
          <p className="text-sm text-slate-500">{list.length} contacts</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)', color: '#090d18' }}
        >
          + Add Contact
        </button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/6">
              {['Name', 'Phone', 'Age', 'Status', 'Last Call', 'Score', ''].map((h) => (
                <th key={h} className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/4">
            {list.map((c) => {
              const name = `${c.first_name} ${c.last_name}`;
              return (
                <tr key={c.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                        {name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <span className="text-sm font-medium text-slate-200">{name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-400">{c.phone}</td>
                  <td className="px-5 py-4 text-sm text-slate-400">{c.age ?? '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCls[c.status] ?? 'text-slate-400 bg-white/5 border-white/10'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-500">{formatLastCall(c.last_call_at)}</td>
                  <td className="px-5 py-4">
                    {c.score !== null ? (
                      <span className="text-sm font-bold" style={{ color: c.score >= 80 ? '#22c55e' : c.score >= 60 ? '#D4AF37' : '#ef4444' }}>
                        {c.score}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <a href="/live-call"
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
                      style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}>
                      Call
                    </a>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-600">No contacts yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
