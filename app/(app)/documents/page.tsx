'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

type DocRow = {
  id: string;
  name: string;
  category: string;
  folder: string;
  tags: string[];
  fileSize: number | null;
  mimeType: string | null;
  version: number;
  scanStatus: string;
  clientName: string | null;
  carrierName: string | null;
  createdAt: string;
};

const categoryColors: Record<string, string> = {
  application: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  policy:      'text-green-400 bg-green-500/10 border-green-500/20',
  id:          'text-violet-400 bg-violet-500/10 border-violet-500/20',
  beneficiary: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  medical:     'text-rose-400 bg-rose-500/10 border-rose-500/20',
  other:       'text-slate-400 bg-white/5 border-white/10',
};

function typeIcon(mime: string | null) {
  if (!mime) return '📁';
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.includes('word')) return '📝';
  return '📁';
}

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    fetch(`/api/documents?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setDocs(d.documents ?? []));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  async function uploadFiles(files: FileList | File[]) {
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'other');
        const res = await fetch('/api/documents', { method: 'POST', body: formData });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Failed to upload ${file.name}`);
        }
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function downloadDoc(id: string) {
    const res = await fetch(`/api/documents/${id}?mode=download`);
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, '_blank');
  }

  async function previewDoc(id: string) {
    const res = await fetch(`/api/documents/${id}?mode=preview`);
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, '_blank');
  }

  async function deleteDoc(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">{docs.length} documents</p>
          <input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 h-9 px-4 rounded-lg border border-dashed border-white/20 text-sm text-slate-400 hover:text-slate-200 hover:border-white/30 hover:bg-white/5 transition-all disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Upload drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${dragOver ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 hover:border-blue-500/30 hover:bg-blue-500/3'}`}
      >
        <p className="text-3xl mb-3">☁️</p>
        <p className="text-slate-400 font-medium">Drop files here to upload</p>
        <p className="text-xs text-slate-600 mt-1">Supports PDF, JPG, PNG, DOCX (max 25MB)</p>
      </div>

      {/* Document table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {['File', 'Category', 'Client / Carrier', 'Size', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc, i) => (
                <tr key={doc.id} className={`border-b border-white/4 hover:bg-white/4 transition-colors ${i % 2 === 0 ? '' : 'bg-white/2'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{typeIcon(doc.mimeType)}</span>
                      <span className="text-slate-200 font-medium truncate max-w-[300px]">{doc.name}</span>
                      {doc.version > 1 && <span className="text-[10px] text-slate-600">v{doc.version}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full border capitalize ${categoryColors[doc.category] ?? categoryColors.other}`}>
                      {doc.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{doc.clientName ?? doc.carrierName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{formatSize(doc.fileSize)}</td>
                  <td className="px-4 py-3 text-slate-500">{doc.createdAt.split('T')[0]}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => previewDoc(doc.id)} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                        View
                      </button>
                      <button onClick={() => downloadDoc(doc.id)} className="text-xs px-2 py-1 rounded bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                        Download
                      </button>
                      <button onClick={() => deleteDoc(doc.id)} className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-600">No documents yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
