export const metadata = { title: 'Documents' };

const mockDocs = [
  { id: 'd1', name: 'Patricia Miller - Americo Application.pdf', type: 'pdf', size: '1.2 MB', client: 'Patricia Miller', date: '2026-06-26', category: 'Application' },
  { id: 'd2', name: 'Henry Thompson - MOO Policy.pdf', type: 'pdf', size: '2.4 MB', client: 'Henry Thompson', date: '2026-05-14', category: 'Policy' },
  { id: 'd3', name: 'Patricia Miller - ID Copy.jpg', type: 'image', size: '450 KB', client: 'Patricia Miller', date: '2026-06-26', category: 'ID' },
  { id: 'd4', name: 'James Chen - Corebridge Quote.pdf', type: 'pdf', size: '800 KB', client: 'James Chen', date: '2026-06-28', category: 'Quote' },
  { id: 'd5', name: 'Agency Contract - Americo 2026.pdf', type: 'pdf', size: '3.1 MB', client: 'Agency', date: '2026-01-01', category: 'Contract' },
  { id: 'd6', name: 'Henry Thompson - APS Request.docx', type: 'doc', size: '120 KB', client: 'Henry Thompson', date: '2026-06-27', category: 'Medical' },
];

const categoryColors: Record<string, string> = {
  Application: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  Policy:      'text-green-400 bg-green-500/10 border-green-500/20',
  ID:          'text-violet-400 bg-violet-500/10 border-violet-500/20',
  Quote:       'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  Contract:    'text-amber-400 bg-amber-500/10 border-amber-500/20',
  Medical:     'text-rose-400 bg-rose-500/10 border-rose-500/20',
};

const typeIcon: Record<string, string> = {
  pdf: '📄',
  image: '🖼️',
  doc: '📝',
};

export default function DocumentsPage() {
  return (
    <div className="space-y-5 max-w-[1600px]">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <p className="text-sm text-slate-500">{mockDocs.length} documents</p>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 h-9 px-4 rounded-lg border border-dashed border-white/20 text-sm text-slate-400 hover:text-slate-200 hover:border-white/30 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload Document
          </button>
        </div>
      </div>

      {/* Upload drop zone */}
      <div className="border-2 border-dashed border-white/10 rounded-2xl p-10 text-center hover:border-blue-500/30 hover:bg-blue-500/3 transition-all cursor-pointer">
        <p className="text-3xl mb-3">☁️</p>
        <p className="text-slate-400 font-medium">Drop files here to upload</p>
        <p className="text-xs text-slate-600 mt-1">Supports PDF, JPG, PNG, DOCX</p>
      </div>

      {/* Document table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {['File', 'Category', 'Client', 'Size', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mockDocs.map((doc, i) => (
                <tr key={doc.id} className={`border-b border-white/4 hover:bg-white/4 transition-colors ${i % 2 === 0 ? '' : 'bg-white/2'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{typeIcon[doc.type]}</span>
                      <span className="text-slate-200 font-medium truncate max-w-[300px]">{doc.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full border ${categoryColors[doc.category] ?? 'text-slate-400 bg-white/5 border-white/10'}`}>
                      {doc.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{doc.client}</td>
                  <td className="px-4 py-3 text-slate-500">{doc.size}</td>
                  <td className="px-4 py-3 text-slate-500">{doc.date}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                        View
                      </button>
                      <button className="text-xs px-2 py-1 rounded bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                        Download
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
