'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import VideoBuilder from '@/components/knowledge/VideoBuilder';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KnowledgeDoc {
  id: string;
  title: string;
  sourceType: string;
  status: 'processing' | 'ready' | 'failed';
  version: number;
  tags: string[];
  fileSize: number | null;
  mimeType: string | null;
  archived: boolean;
  categoryId: string | null;
  carrierName: string | null;
  categoryName: string | null;
  createdAt: string;
}

interface SearchResult {
  id: string;
  title: string;
  sourceType: string;
  snippet: string;
  similarity?: number;
  matchType: 'hybrid' | 'semantic' | 'keyword';
}

// ─── Static scripts data ───────────────────────────────────────────────────────

const SCRIPT_SECTIONS = [
  {
    title: 'Opening Scripts', icon: '👋', color: '#D4AF37',
    articles: [
      { title: 'Standard Opening', content: `"Hi, may I speak with [Name]? ... Hi [Name], this is [Your Name] with [Company]. The reason I'm calling is you recently filled out a card online requesting information about final expense life insurance. Did you receive the information you were looking for?"` },
      { title: 'Callback Opening', content: `"Hi [Name], this is [Your Name] getting back with you. You had requested some information about final expense coverage — do you have just a few minutes to talk?"` },
    ],
  },
  {
    title: 'Objection Handling', icon: '🛡️', color: '#ef4444',
    articles: [
      { title: 'Already Have Insurance', content: `Ask: "What company is it with?" → "How much coverage do you have?" → "What are you paying for it?" → "What made you feel that wasn't quite enough to look at something else?" Their existing coverage is a buying signal — don't move on.` },
      { title: 'Need to Think About It', content: `"That's fair. Before I let you go — is there something specific you'd like to think about? I want to make sure I gave you everything you need to make the best decision for your family."` },
      { title: 'Too Expensive', content: `"I completely understand. When you say it feels expensive, are you comparing it to something, or is the budget just tight? Because most of our clients find a plan that works for them — let me ask: what monthly amount would feel comfortable?"` },
    ],
  },
  {
    title: 'Health Questions Script', icon: '❤️', color: '#22c55e',
    articles: [
      { title: 'Full Health Question Sequence', content: `1. "How is your overall health — are you in pretty good shape?"\n2. "Are you a tobacco user at all?"\n3. "Do you have any major health conditions like diabetes, heart problems, or cancer?"\n4. "Have you been hospitalized in the last 2 years?"\n5. "What medications are you currently taking?"\n6. "Are you currently using oxygen or any assisted mobility devices?"` },
    ],
  },
  {
    title: 'Closing Scripts', icon: '✅', color: '#a78bfa',
    articles: [
      { title: 'The Assumptive Close', content: `"Based on everything you've told me, I can get you [coverage amount] with [carrier] for right around [price] a month. Would you like to go ahead and get that started today so we can get you protected right away?"` },
      { title: 'The Choice Close', content: `"Now I have you down for [option A] at [price] and [option B] at [price]. Which of those feels more comfortable for you?"` },
      { title: 'The Takeaway Close', content: `"I completely understand. You know, I talk to a lot of seniors who say the same thing. The ones who don't move forward today usually end up calling back in 6 months when their health has changed and they no longer qualify. I'd hate for that to happen to you."` },
    ],
  },
  {
    title: 'Budget Questions', icon: '💰', color: '#f59e0b',
    articles: [
      { title: 'Finding the Budget Number', content: `"The average plan runs between $30-60 per month depending on your age and health. Is there a monthly amount that would feel comfortable for you to set aside for this?" ... Wait for answer ... "Great, I can definitely work within that range."` },
    ],
  },
  {
    title: 'Funeral & Discovery Questions', icon: '🔍', color: '#06b6d4',
    articles: [
      { title: 'Discovery Script', content: `"Can I ask — what made you reach out about this?" ... "Have you given any thought to final arrangements — like whether you prefer burial or cremation?" ... "Do you have a specific funeral home in mind?" ... "Have you gotten any estimates on what that might cost?"` },
      { title: 'Beneficiary Question', content: `"Who would you want to receive the benefit when the time comes? ... And is that a spouse, a child, or a grandchild?" (Always collect full name, relationship, and date of birth)` },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  carrier_guide: 'Carrier Guide',
  underwriting_manual: 'Underwriting Manual',
  script: 'Script',
  objection_handling: 'Objection Handling',
  closing_technique: 'Closing Technique',
  compliance: 'Compliance',
  product_doc: 'Product Doc',
  training: 'Training',
  url_import: 'Web Page',
  csv_data: 'CSV Data',
  other: 'Other',
};

const SOURCE_COLORS: Record<string, string> = {
  carrier_guide: '#3b82f6',
  underwriting_manual: '#8b5cf6',
  script: '#D4AF37',
  objection_handling: '#ef4444',
  closing_technique: '#a78bfa',
  compliance: '#f59e0b',
  product_doc: '#06b6d4',
  training: '#22c55e',
  url_import: '#0ea5e9',
  csv_data: '#10b981',
  other: '#64748b',
};

function fmtBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

type UploadMode = 'file' | 'url' | 'csv';

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [mode, setMode] = useState<UploadMode>('file');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File mode
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [sourceType, setSourceType] = useState('other');
  const fileRef = useRef<HTMLInputElement>(null);

  // URL mode
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [urlSourceType, setUrlSourceType] = useState('url_import');

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(pdf|docx|txt|md|csv)$/i.test(f.name)
    );
    setFiles((prev) => [...prev, ...dropped]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sel = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...sel]);
  };

  const uploadFiles = async () => {
    setUploading(true);
    setError(null);
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name.replace(/\.[^.]+$/, ''));
      fd.append('sourceType', file.name.endsWith('.csv') ? 'csv_data' : sourceType);

      const endpoint = file.name.endsWith('.csv') ? '/api/knowledge/csv' : '/api/knowledge/ingest';
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Upload failed');
        setUploading(false);
        return;
      }
    }
    onUploaded();
    onClose();
  };

  const importUrl = async () => {
    if (!url.trim()) return;
    setUploading(true);
    setError(null);
    const res = await fetch('/api/knowledge/url-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim(), title: urlTitle.trim() || undefined, sourceType: urlSourceType }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Import failed');
    } else {
      onUploaded();
      onClose();
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="glass-card rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8">
          <h3 className="text-base font-bold text-slate-100 flex-1">Add Document</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 m-4 rounded-xl bg-white/5 w-fit">
          {([['file', 'Upload File'], ['url', 'Import URL'], ['csv', 'Import CSV']] as [UploadMode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === m ? 'bg-white/15 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="px-6 pb-6 space-y-4">
          {mode === 'file' && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-500/60 bg-blue-500/5' : 'border-white/10 hover:border-white/20 hover:bg-white/3'}`}
              >
                <svg className="w-8 h-8 mx-auto mb-2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p className="text-sm text-slate-400">Drag & drop or click to browse</p>
                <p className="text-xs text-slate-600 mt-1">PDF, DOCX, TXT, MD, CSV — up to 25 MB</p>
                <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={handleFileChange} />
              </div>

              {files.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2 rounded-lg bg-white/5">
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-slate-600">{fmtBytes(f.size)}</span>
                      <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400">✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Document Type</label>
                <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60">
                  {Object.entries(SOURCE_LABELS).filter(([k]) => k !== 'url_import' && k !== 'csv_data').map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={uploadFiles} disabled={uploading || !files.length}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-colors">
                {uploading ? 'Uploading…' : `Upload ${files.length || ''} File${files.length !== 1 ? 's' : ''}`}
              </button>
            </>
          )}

          {mode === 'url' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">URL</label>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Title (optional)</label>
                <input type="text" value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} placeholder="Leave blank to use page title"
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Document Type</label>
                <select value={urlSourceType} onChange={(e) => setUrlSourceType(e.target.value)}
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60">
                  <option value="url_import">Web Page</option>
                  {Object.entries(SOURCE_LABELS).filter(([k]) => k !== 'url_import' && k !== 'csv_data').map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={importUrl} disabled={uploading || !url.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-colors">
                {uploading ? 'Importing…' : 'Import Page'}
              </button>
            </>
          )}

          {mode === 'csv' && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f?.name.endsWith('.csv')) setFiles([f]);
                }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-green-500/60 bg-green-500/5' : 'border-white/10 hover:border-white/20 hover:bg-white/3'}`}
              >
                <svg className="w-8 h-8 mx-auto mb-2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>
                </svg>
                <p className="text-sm text-slate-400">{files[0]?.name ?? 'Drop CSV file here'}</p>
                <p className="text-xs text-slate-600 mt-1">First row must be column headers — up to 5 MB</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={uploadFiles} disabled={uploading || !files.length}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white transition-colors">
                {uploading ? 'Importing…' : 'Import CSV'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Document Card ─────────────────────────────────────────────────────────────

function DocCard({ doc, onRefresh }: { doc: KnowledgeDoc; onRefresh: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(doc.title);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const patch = async (body: object) => {
    setBusy(true);
    await fetch(`/api/knowledge/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    onRefresh();
  };

  const handleRename = async () => {
    if (newTitle.trim() && newTitle !== doc.title) await patch({ title: newTitle.trim() });
    setRenaming(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setBusy(true);
    await fetch(`/api/knowledge/documents/${doc.id}`, { method: 'DELETE' });
    setBusy(false);
    onRefresh();
  };

  const handleDownload = async () => {
    if (!doc.mimeType || doc.sourceType === 'url_import') return;
    const res = await fetch(`/api/knowledge/documents/${doc.id}`);
    const j = await res.json();
    if (j.url) window.open(j.url, '_blank');
  };

  const color = SOURCE_COLORS[doc.sourceType] ?? '#64748b';
  const statusColor = doc.status === 'ready' ? '#22c55e' : doc.status === 'failed' ? '#ef4444' : '#f59e0b';
  const statusLabel = doc.status === 'ready' ? 'Ready' : doc.status === 'failed' ? 'Failed' : 'Processing';

  return (
    <div className={`glass-card rounded-2xl overflow-hidden transition-opacity ${doc.archived ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3 p-4">
        {/* Color dot */}
        <div className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: color }} />

        <div className="flex-1 min-w-0">
          {renaming ? (
            <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onBlur={handleRename} onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
              className="w-full bg-white/8 border border-blue-500/50 rounded-lg px-2 py-1 text-sm text-slate-100 focus:outline-none" />
          ) : (
            <p className="text-sm font-semibold text-slate-200 truncate leading-snug">{doc.title}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
              style={{ color, borderColor: `${color}40`, background: `${color}14` }}>
              {SOURCE_LABELS[doc.sourceType] ?? doc.sourceType}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ color: statusColor, background: `${statusColor}14` }}>
              {statusLabel}
            </span>
            {doc.categoryName && (
              <span className="text-[10px] text-slate-500">{doc.categoryName}</span>
            )}
            {doc.archived && (
              <span className="text-[10px] font-semibold text-slate-600">Archived</span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-600">
            <span>{fmtDate(doc.createdAt)}</span>
            {doc.fileSize && <span>{fmtBytes(doc.fileSize)}</span>}
            {doc.carrierName && <span>{doc.carrierName}</span>}
          </div>

          {doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {doc.tags.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/6 text-slate-500">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Actions menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button onClick={() => setMenuOpen((o) => !o)} disabled={busy}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/8 transition-colors">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-20 w-44 glass-card rounded-xl py-1 border border-white/8 shadow-xl">
              {doc.mimeType && doc.sourceType !== 'url_import' && (
                <button onClick={() => { setMenuOpen(false); handleDownload(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/6 transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download
                </button>
              )}
              <button onClick={() => { setMenuOpen(false); setRenaming(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/6 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Rename
              </button>
              <button onClick={() => { setMenuOpen(false); patch({ archived: !doc.archived }); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/6 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
                </svg>
                {doc.archived ? 'Unarchive' : 'Archive'}
              </button>
              <div className="my-1 border-t border-white/6" />
              <button onClick={() => { setMenuOpen(false); handleDelete(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Library Tab ──────────────────────────────────────────────────────────────

function LibraryTab() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/knowledge/documents');
    if (res.ok) {
      const j = await res.json();
      setDocs(j.documents ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const filtered = docs.filter((d) => {
    if (!showArchived && d.archived) return false;
    if (filter !== 'all' && d.sourceType !== filter) return false;
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const types = Array.from(new Set(docs.map((d) => d.sourceType)));

  const counts = { ready: docs.filter((d) => d.status === 'ready' && !d.archived).length, total: docs.filter((d) => !d.archived).length };

  return (
    <>
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={fetchDocs} />}

      {/* Header row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…"
            className="w-full bg-white/6 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50" />
        </div>

        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="bg-white/6 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-400 focus:outline-none focus:border-blue-500/50">
          <option value="all">All types</option>
          {types.map((t) => <option key={t} value={t}>{SOURCE_LABELS[t] ?? t}</option>)}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-3.5 h-3.5 rounded" />
          Show archived
        </label>

        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Document
        </button>
      </div>

      {/* Stats bar */}
      {!loading && (
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span>{counts.total} document{counts.total !== 1 ? 's' : ''}</span>
          <span className="text-green-500">{counts.ready} ready</span>
          {filtered.length !== docs.length && <span>{filtered.length} shown</span>}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-600 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <svg className="w-12 h-12 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <p className="text-slate-500 text-sm">{docs.length === 0 ? 'No documents yet' : 'No documents match your filters'}</p>
          {docs.length === 0 && (
            <button onClick={() => setShowUpload(true)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors mt-1">
              Upload your first document
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((d) => <DocCard key={d.id} doc={d} onRefresh={fetchDocs} />)}
        </div>
      )}
    </>
  );
}

// ─── Search Tab ───────────────────────────────────────────────────────────────

function SearchTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const j = await res.json();
      setResults(j.results ?? []);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text" value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch(query)}
            placeholder="Search your knowledge library…"
            className="w-full bg-white/6 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
          />
        </div>
        <button onClick={() => doSearch(query)} disabled={loading || !query.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-colors">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {!searched && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600 text-sm gap-2">
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p>Semantic search across all your documents and call insights</p>
        </div>
      )}

      {searched && !loading && results.length === 0 && (
        <p className="text-center text-slate-500 text-sm py-12">No results found for "{query}"</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className="glass-card rounded-xl p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200 truncate">{r.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-500">{SOURCE_LABELS[r.sourceType] ?? r.sourceType}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: r.matchType === 'hybrid' ? '#22c55e' : r.matchType === 'semantic' ? '#3b82f6' : '#f59e0b', background: r.matchType === 'hybrid' ? '#22c55e14' : r.matchType === 'semantic' ? '#3b82f614' : '#f59e0b14' }}>
                      {r.matchType}
                    </span>
                    {r.similarity != null && <span className="text-[10px] text-slate-600">{Math.round(r.similarity * 100)}% match</span>}
                  </div>
                </div>
              </div>
              {r.snippet && <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{r.snippet}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'library' | 'scripts' | 'videos' | 'search';

export default function KnowledgeBasePage() {
  const [tab, setTab] = useState<Tab>('library');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'library',
      label: 'Document Library',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
    },
    {
      id: 'search',
      label: 'Search',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    },
    {
      id: 'scripts',
      label: 'Scripts',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    },
    {
      id: 'videos',
      label: 'Video Builder',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>,
    },
  ];

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Knowledge Base</h2>
        <p className="text-sm text-slate-500 mt-1">Upload carrier guides, scripts, and reference material — the AI references this during live calls</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 w-fit">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? 'bg-white/15 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === 'library' && (
        <div className="space-y-4">
          <LibraryTab />
        </div>
      )}

      {tab === 'search' && <SearchTab />}

      {tab === 'scripts' && (
        <div className="space-y-5">
          {SCRIPT_SECTIONS.map((section) => (
            <div key={section.title} className="glass-card rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/6"
                style={{ background: `${section.color}08` }}>
                <span className="text-xl">{section.icon}</span>
                <h3 className="text-sm font-bold text-slate-200">{section.title}</h3>
                <span className="ml-auto text-[10px] font-semibold text-slate-500">{section.articles.length} articles</span>
              </div>
              <div className="divide-y divide-white/4">
                {section.articles.map((article) => (
                  <details key={article.title} className="group">
                    <summary className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-white/3 transition-colors list-none">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: section.color }} />
                      <span className="text-sm font-medium text-slate-300 flex-1">{article.title}</span>
                      <svg className="w-4 h-4 text-slate-600 group-open:rotate-180 transition-transform shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </summary>
                    <div className="px-5 pb-4 pt-1">
                      <div className="rounded-xl p-4 bg-white/3 border border-white/6">
                        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{article.content}</p>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'videos' && <VideoBuilder />}
    </div>
  );
}
