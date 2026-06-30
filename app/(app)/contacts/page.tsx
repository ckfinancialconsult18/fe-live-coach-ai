export const metadata = { title: 'Contacts' };

const contacts = [
  { name: 'Dorothy Williams', phone: '(555) 234-5678', age: 68, status: 'Prospect', lastCall: 'Today 2:30 PM', score: 82 },
  { name: 'Robert Martinez',  phone: '(555) 345-6789', age: 74, status: 'Follow Up', lastCall: 'Today 11:15 AM', score: 51 },
  { name: 'Helen Johnson',    phone: '(555) 456-7890', age: 61, status: 'Client',    lastCall: 'Yesterday',     score: 91 },
  { name: 'James Thompson',   phone: '(555) 567-8901', age: 79, status: 'DNC',       lastCall: 'Yesterday',     score: 34 },
  { name: 'Betty Crawford',   phone: '(555) 678-9012', age: 66, status: 'Prospect',  lastCall: 'Jun 27',        score: null },
  { name: 'Earl Stevens',     phone: '(555) 789-0123', age: 71, status: 'Prospect',  lastCall: 'Jun 26',        score: null },
  { name: 'Marie Lopez',      phone: '(555) 890-1234', age: 63, status: 'Prospect',  lastCall: 'Jun 25',        score: 68 },
];

const statusCls: Record<string, string> = {
  Client:    'text-green-400 bg-green-500/10 border-green-500/20',
  Prospect:  'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Follow Up': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  DNC:       'text-red-400 bg-red-500/10 border-red-500/20',
};

export default function ContactsPage() {
  return (
    <div className="space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Contacts</h2>
          <p className="text-sm text-slate-500">{contacts.length} contacts</p>
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
            {contacts.map((c) => (
              <tr key={c.name} className="hover:bg-white/3 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                      {c.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <span className="text-sm font-medium text-slate-200">{c.name}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-slate-400">{c.phone}</td>
                <td className="px-5 py-4 text-sm text-slate-400">{c.age}</td>
                <td className="px-5 py-4">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCls[c.status] ?? 'text-slate-400 bg-white/5 border-white/10'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-slate-500">{c.lastCall}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
