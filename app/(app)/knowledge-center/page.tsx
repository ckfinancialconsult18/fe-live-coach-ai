'use client';

import { useState, useEffect, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { scoreColor } from '@/lib/score-color';
import type { PipelineJob, PendingEntryIndex, PendingKnowledgeEntry, PipelineStats, SearchResult } from '@/lib/pipeline/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.vtt'];

const TYPE_LABELS: Record<string, string> = {
  objection: 'Objection', rebuttal_successful: 'Rebuttal ✓', rebuttal_failed: 'Rebuttal ✗',
  buying_signal: 'Buying Signal', emotional_trigger: 'Emotional Trigger', medication: 'Medication',
  diagnosis: 'Diagnosis', underwriting: 'Underwriting', carrier: 'Carrier', compliance: 'Compliance',
  closing_technique: 'Closing Technique', successful_close: 'Successful Close', failed_close: 'Failed Close',
  discovery_question: 'Discovery Q', sales_psychology: 'Sales Psychology', personality: 'Personality',
  financial_concern: 'Financial Concern', family_dynamic: 'Family Dynamic', funeral_concern: 'Funeral Concern',
  coaching_opportunity: 'Coaching Opp', agent_mistake: 'Agent Mistake', agent_strength: 'Agent Strength',
  memorable_phrase: 'Memorable Phrase',
};

const TYPE_COLORS: Record<string, string> = {
  objection: 'text-red-400 bg-red-400/10 border-red-400/20',
  rebuttal_successful: 'text-green-400 bg-green-400/10 border-green-400/20',
  rebuttal_failed: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  buying_signal: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  emotional_trigger: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  medication: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  diagnosis: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  underwriting: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  carrier: 'text-[#D4AF37] bg-[rgba(212,175,55,0.1)] border-[rgba(212,175,55,0.2)]',
  compliance: 'text-red-300 bg-red-300/10 border-red-300/20',
  closing_technique: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  successful_close: 'text-green-300 bg-green-300/10 border-green-300/20',
  failed_close: 'text-red-400 bg-red-400/10 border-red-400/20',
  discovery_question: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  sales_psychology: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  personality: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
  agent_mistake: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  agent_strength: 'text-lime-400 bg-lime-400/10 border-lime-400/20',
  memorable_phrase: 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20',
  default: 'text-slate-400 bg-white/5 border-white/10',
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'upload' | 'review' | 'dashboard' | 'search';

export default function KnowledgeCenterPage() {
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [pendingEntries, setPendingEntries] = useState<PendingEntryIndex[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showNotification = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const loadJobs = useCallback(async () => {
    const res = await fetch('/api/pipeline/queue').catch(() => null);
    if (res?.ok) setJobs(await res.json().then((d: { jobs: PipelineJob[] }) => d.jobs));
  }, []);

  const loadPending = useCallback(async (filter: string = 'pending') => {
    const res = await fetch(`/api/pipeline/pending?filter=${filter}&pageSize=100`).catch(() => null);
    if (res?.ok) {
      const d = await res.json() as { entries: PendingEntryIndex[]; total: number };
      setPendingEntries(d.entries);
      setPendingTotal(d.total);
    }
  }, []);

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/pipeline/stats').catch(() => null);
    if (res?.ok) setStats(await res.json().then((d: { stats: PipelineStats }) => d.stats));
  }, []);

  // Initial load
  useEffect(() => {
    loadJobs();
    loadPending();
    loadStats();
  }, [loadJobs, loadPending, loadStats]);

  // Poll queue while processing
  useEffect(() => {
    const hasActive = jobs.some((j) =>
      ['queued', 'parsing', 'extracting', 'deduplicating'].includes(j.status)
    );
    if (!hasActive) return;
    const iv = setInterval(loadJobs, 2500);
    return () => clearInterval(iv);
  }, [jobs, loadJobs]);

  const runProcessingLoop = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      let iterations = 0;
      while (iterations < 500) {
        const res = await fetch('/api/pipeline/process', { method: 'POST' });
        if (!res.ok) {
          await loadJobs();
          break;
        }
        const data = await res.json() as { done: boolean };
        await loadJobs();
        if (data.done) break;
        iterations++;
      }
    } finally {
      setIsProcessing(false);
      await loadPending();
      await loadStats();
      showNotification('Processing complete — review new knowledge entries');
    }
  }, [isProcessing, loadJobs, loadPending, loadStats, showNotification]);

  const onFilesSelected = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const filtered = files.filter((f) =>
      ACCEPTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    if (!filtered.length) {
      showNotification('No supported files found (.txt, .md, .pdf, .docx, .vtt)', 'error');
      return;
    }

    const fd = new FormData();
    for (const f of filtered) fd.append('files', f);

    const res = await fetch('/api/pipeline/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      showNotification('Upload failed', 'error');
      return;
    }
    const { jobs: newJobs } = await res.json() as { jobs: PipelineJob[] };
    showNotification(`${newJobs.length} file${newJobs.length !== 1 ? 's' : ''} queued for processing`);
    await loadJobs();
    runProcessingLoop();
  }, [loadJobs, runProcessingLoop, showNotification]);

  return (
    <div className="flex flex-col h-full">
      {/* Notification */}
      {notification && (
        <div className={`shrink-0 flex items-center gap-2 px-5 py-2 text-xs font-medium border-b animate-alert ${
          notification.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <span>{notification.type === 'success' ? '✓' : '✗'}</span>
          {notification.text}
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/6">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Knowledge Center</h1>
          <p className="text-xs text-slate-500 mt-0.5">Continuous learning pipeline — upload transcripts, review insights, grow the AI coaching model</p>
        </div>
        <div className="flex items-center gap-3">
          {isProcessing && (
            <div className="flex items-center gap-2 text-xs text-[#D4AF37]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-live" />
              Processing queue…
            </div>
          )}
          {stats && (
            <div className="flex items-center gap-4 text-center">
              <StatChip label="Transcripts" value={stats.totalJobs} />
              <StatChip label="Insights" value={stats.totalInsightsExtracted} />
              <StatChip label="Pending" value={stats.pendingReview} accent />
              <StatChip label="Approved" value={stats.approvedTotal} green />
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-white/6 px-6">
        {(['upload', 'review', 'dashboard', 'search'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === 'review') loadPending();
              if (tab === 'dashboard') loadStats();
            }}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {tab === 'upload' ? '⬆ Upload' :
             tab === 'review' ? `✦ Review ${pendingTotal > 0 ? `(${pendingTotal})` : ''}` :
             tab === 'dashboard' ? '◈ Dashboard' : '⌕ Search'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'upload' && (
          <UploadTab jobs={jobs} onFilesSelected={onFilesSelected} isProcessing={isProcessing} />
        )}
        {activeTab === 'review' && (
          <ReviewTab
            entries={pendingEntries}
            total={pendingTotal}
            onReload={loadPending}
            onNotify={showNotification}
          />
        )}
        {activeTab === 'dashboard' && <DashboardTab stats={stats} />}
        {activeTab === 'search' && <SearchTab />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload Tab
// ─────────────────────────────────────────────────────────────────────────────

function UploadTab({
  jobs,
  onFilesSelected,
  isProcessing,
}: {
  jobs: PipelineJob[];
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const collectEntries = useCallback(
    (entry: FileSystemEntry, collected: File[]): Promise<void> => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          (entry as FileSystemFileEntry).file((f) => { collected.push(f); resolve(); });
        } else if (entry.isDirectory) {
          const reader = (entry as FileSystemDirectoryEntry).createReader();
          const readAll = (files: FileSystemEntry[]) => {
            reader.readEntries(async (entries) => {
              if (!entries.length) {
                await Promise.all(files.map((e) => collectEntries(e, collected)));
                resolve();
                return;
              }
              readAll([...files, ...entries]);
            });
          };
          readAll([]);
        } else {
          resolve();
        }
      });
    },
    []
  );

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const items = Array.from(e.dataTransfer.items);
      const collected: File[] = [];
      await Promise.all(
        items.map((item) => {
          const entry = item.webkitGetAsEntry?.();
          if (entry) return collectEntries(entry, collected);
          const f = item.getAsFile();
          if (f) collected.push(f);
          return Promise.resolve();
        })
      );
      onFilesSelected(collected);
    },
    [collectEntries, onFilesSelected]
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onFilesSelected(Array.from(e.target.files ?? []));
      e.target.value = '';
    },
    [onFilesSelected]
  );

  const active = jobs.filter((j) => ['queued', 'parsing', 'extracting', 'deduplicating'].includes(j.status));
  const completed = jobs.filter((j) => j.status === 'pending_review' || j.status === 'completed');
  const failed = jobs.filter((j) => j.status === 'failed');

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 ${
          isDragging
            ? 'border-[#D4AF37] bg-[rgba(212,175,55,0.06)] scale-[1.01]'
            : 'border-white/12 bg-white/2 hover:border-white/20 hover:bg-white/3'
        }`}
      >
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: isDragging ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)' }}>
            <UploadCloudIcon active={isDragging} />
          </div>
          <p className="text-base font-semibold text-slate-200 mb-1">
            {isDragging ? 'Drop to add to processing queue' : 'Drop transcripts or folders here'}
          </p>
          <p className="text-xs text-slate-500 mb-6">
            Supports .txt · .md · .pdf · .docx · Zoom · Teams · Google Meet exports
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #D4AF37, #9a7a0a)', color: '#090d18', boxShadow: '0 4px 16px rgba(212,175,55,0.3)' }}
            >
              <FileIcon /> Browse Files
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/6 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
            >
              <FolderIcon /> Upload Folder
            </button>
          </div>
          <p className="text-[10px] text-slate-700 mt-4">
            Processes in background — continue using FE Live Coach AI while queue runs
          </p>
        </div>
        <input
          ref={fileInputRef} type="file" multiple hidden
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleFileInput}
        />
        <input
          ref={folderInputRef} type="file" hidden
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={handleFileInput}
        />
      </div>

      {/* Queue summary */}
      {jobs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <QueueCard label="In Queue" value={active.length} color="text-[#D4AF37]" spinning={isProcessing && active.length > 0} />
          <QueueCard label="Completed" value={completed.length} color="text-green-400" />
          <QueueCard label="Failed" value={failed.length} color="text-red-400" />
        </div>
      )}

      {/* Job list */}
      {jobs.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Processing Queue</p>
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {jobs.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function QueueCard({ label, value, color, spinning }: { label: string; value: number; color: string; spinning?: boolean }) {
  return (
    <div className="glass-card rounded-xl p-4 flex items-center gap-3">
      {spinning && <div className="w-3 h-3 rounded-full border border-[#D4AF37] border-t-transparent animate-spin shrink-0" />}
      <div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function JobCard({ job }: { job: PipelineJob }) {
  const statusColors: Record<string, string> = {
    queued: 'text-slate-500', parsing: 'text-blue-400', extracting: 'text-violet-400',
    deduplicating: 'text-amber-400', pending_review: 'text-green-400',
    completed: 'text-green-400', failed: 'text-red-400',
  };
  const statusLabels: Record<string, string> = {
    queued: 'Queued', parsing: 'Parsing…', extracting: 'Extracting…',
    deduplicating: 'Deduplicating…', pending_review: 'Ready for Review',
    completed: 'Complete', failed: 'Failed',
  };
  const isActive = ['parsing', 'extracting', 'deduplicating'].includes(job.status);

  return (
    <div className="glass-card rounded-xl px-4 py-3">
      <div className="flex items-center gap-3">
        {isActive
          ? <div className="w-3 h-3 rounded-full border border-[rgba(212,175,55,0.6)] border-t-transparent animate-spin shrink-0" />
          : <div className={`w-2 h-2 rounded-full shrink-0 ${
              job.status === 'failed' ? 'bg-red-400' :
              job.status === 'pending_review' || job.status === 'completed' ? 'bg-green-400' :
              'bg-white/20'
            }`} />
        }
        <span className="text-xs text-slate-300 truncate flex-1 font-mono">{job.originalName}</span>
        <span className={`text-[10px] font-semibold shrink-0 ${statusColors[job.status] ?? 'text-slate-500'}`}>
          {statusLabels[job.status] ?? job.status}
        </span>
        {job.newKnowledgeCount !== undefined && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20 shrink-0">
            +{job.newKnowledgeCount} new
          </span>
        )}
        <span className="text-[10px] text-slate-600 shrink-0 uppercase">{job.format}</span>
      </div>
      {isActive && (
        <div className="mt-2 h-1 rounded-full bg-white/5">
          <div
            className="h-1 rounded-full transition-all duration-700"
            style={{ width: `${job.progress}%`, background: 'linear-gradient(90deg, #D4AF37, #9a7a0a)' }}
          />
        </div>
      )}
      {job.error && <p className="text-[10px] text-red-400 mt-1 truncate">{job.error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Review Tab
// ─────────────────────────────────────────────────────────────────────────────

function ReviewTab({
  entries,
  total,
  onReload,
  onNotify,
}: {
  entries: PendingEntryIndex[];
  total: number;
  onReload: (filter?: string) => void;
  onNotify: (text: string, type?: 'success' | 'error') => void;
}) {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<PendingKnowledgeEntry | null>(null);
  const [isActing, setIsActing] = useState(false);

  const loadExpanded = useCallback(async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setExpandedEntry(null); return; }
    setExpandedId(id);
    const res = await fetch(`/api/pipeline/pending?id=${id}`);
    if (res.ok) setExpandedEntry(await res.json().then((d: { entry: PendingKnowledgeEntry }) => d.entry));
  }, [expandedId]);

  const act = useCallback(async (
    ids: string[],
    action: 'approve' | 'reject',
    note?: string
  ) => {
    if (!ids.length || isActing) return;
    setIsActing(true);
    try {
      const res = await fetch('/api/pipeline/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, note }),
      });
      if (!res.ok) throw new Error('Action failed');
      const count = ids.length;
      onNotify(`${action === 'approve' ? 'Approved' : 'Rejected'} ${count} ${count === 1 ? 'entry' : 'entries'}`);
      setSelectedIds(new Set());
      setExpandedId(null);
      setExpandedEntry(null);
      onReload(filter);
    } catch {
      onNotify('Action failed', 'error');
    } finally {
      setIsActing(false);
    }
  }, [filter, isActing, onNotify, onReload]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const pending = entries.filter((e) => e.status === 'pending');
    setSelectedIds(new Set(pending.map((e) => e.id)));
  }, [entries]);

  const pendingCount = entries.filter((e) => e.status === 'pending').length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-white/6">
        {/* Filter */}
        <div className="flex items-center gap-1 bg-white/4 rounded-lg p-0.5">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); onReload(f); setSelectedIds(new Set()); }}
              className={`px-3 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                filter === f ? 'bg-white/10 text-slate-200' : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-600">{total} entries</span>
        <div className="flex-1" />
        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <>
            <span className="text-xs text-slate-400">{selectedIds.size} selected</span>
            <button
              onClick={() => act(Array.from(selectedIds), 'approve')}
              disabled={isActing}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 disabled:opacity-50 transition-colors"
            >
              Approve All
            </button>
            <button
              onClick={() => act(Array.from(selectedIds), 'reject')}
              disabled={isActing}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              Reject All
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-600 hover:text-slate-400">Clear</button>
          </>
        )}
        {filter === 'pending' && pendingCount > 0 && selectedIds.size === 0 && (
          <button onClick={selectAll} className="text-xs text-slate-600 hover:text-slate-400">Select All Pending</button>
        )}
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2">
        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-3xl">📭</p>
            <p className="text-sm font-semibold text-slate-400">
              {filter === 'pending' ? 'No pending knowledge to review' : `No ${filter} entries`}
            </p>
            <p className="text-xs text-slate-600">Upload transcripts to start extracting knowledge</p>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id}>
            <div
              className={`glass-card rounded-xl px-4 py-3 cursor-pointer transition-all hover:bg-white/5 ${
                selectedIds.has(entry.id) ? 'ring-1 ring-[rgba(212,175,55,0.4)]' : ''
              } ${entry.isDuplicate ? 'opacity-50' : ''}`}
              onClick={() => loadExpanded(entry.id)}
            >
              <div className="flex items-center gap-3">
                {entry.status === 'pending' && !entry.isDuplicate && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelect(entry.id); }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-3.5 h-3.5 shrink-0 accent-[#D4AF37]"
                  />
                )}
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${TYPE_COLORS[entry.type] ?? TYPE_COLORS.default}`}>
                  {TYPE_LABELS[entry.type] ?? entry.type}
                </span>
                <span className="text-xs text-slate-300 flex-1 truncate">{entry.summary}</span>
                {entry.isDuplicate && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-slate-600 border border-white/8 shrink-0">Duplicate</span>
                )}
                <span className="text-[10px] font-bold shrink-0" style={{ color: scoreColor(entry.confidence) }}>
                  {entry.confidence}%
                </span>
                <StatusDot status={entry.status} />
                {entry.status === 'pending' && !entry.isDuplicate && (
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => act([entry.id], 'approve')}
                      disabled={isActing}
                      className="px-2 py-1 rounded text-[10px] font-bold bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-40 transition-colors"
                    >✓</button>
                    <button
                      onClick={() => act([entry.id], 'reject')}
                      disabled={isActing}
                      className="px-2 py-1 rounded text-[10px] font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
                    >✗</button>
                  </div>
                )}
                <ChevronDownIcon expanded={expandedId === entry.id} />
              </div>
            </div>

            {expandedId === entry.id && expandedEntry && (
              <div className="ml-4 mt-1 glass-card rounded-xl p-4 space-y-3 border border-white/6 animate-alert">
                <div className="flex flex-wrap gap-1.5">
                  {expandedEntry.tags.map((tag) => (
                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-slate-500 border border-white/8">{tag}</span>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Transcript Evidence</p>
                  <blockquote className="border-l-2 border-[rgba(212,175,55,0.3)] pl-3 text-xs text-slate-400 italic leading-relaxed">
                    {expandedEntry.evidence}
                  </blockquote>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Content</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{expandedEntry.content}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Markdown Entry</p>
                  <pre className="text-[10px] text-slate-500 bg-white/3 border border-white/6 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                    {expandedEntry.markdownEntry}
                  </pre>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-slate-600">Source: {expandedEntry.originalFilename}</span>
                  <span className="text-[10px] text-slate-700">·</span>
                  <span className="text-[10px] text-slate-600">{expandedEntry.targetFile.replace(/_/g, ' ')}</span>
                  {expandedEntry.callScore && (
                    <>
                      <span className="text-[10px] text-slate-700">·</span>
                      <span className="text-[10px]" style={{ color: scoreColor(expandedEntry.callScore) }}>
                        Call score {expandedEntry.callScore}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Tab
// ─────────────────────────────────────────────────────────────────────────────

function DashboardTab({ stats }: { stats: PipelineStats | null }) {
  if (!stats) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
    </div>
  );

  const typeGroups = [
    { label: 'Objections', keys: ['objection', 'rebuttal_successful', 'rebuttal_failed'], color: '#ef4444' },
    { label: 'Buying Signals', keys: ['buying_signal', 'emotional_trigger'], color: '#22c55e' },
    { label: 'Medical', keys: ['medication', 'diagnosis', 'underwriting'], color: '#a855f7' },
    { label: 'Closing', keys: ['closing_technique', 'successful_close', 'failed_close'], color: '#3b82f6' },
    { label: 'Coaching', keys: ['agent_mistake', 'agent_strength', 'coaching_opportunity'], color: '#D4AF37' },
    { label: 'Personality', keys: ['personality', 'sales_psychology', 'financial_concern'], color: '#ec4899' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* KPI strip */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard label="Total Transcripts" value={stats.totalTranscripts} />
        <KpiCard label="Sales Calls" value={stats.salesCalls} />
        <KpiCard label="Coaching Calls" value={stats.coachingCalls} />
        <KpiCard label="Total Insights" value={stats.totalInsightsExtracted} />
        <KpiCard label="Pending Review" value={stats.pendingReview} accent />
        <KpiCard label="Approved" value={stats.approvedTotal} green />
        <KpiCard label="Rejected" value={stats.rejectedTotal} />
        <KpiCard label="Duplicates Skipped" value={stats.duplicatesSkipped} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Knowledge by type */}
        <div className="glass-card rounded-2xl p-5 space-y-4 lg:col-span-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Knowledge by Category</h3>
          {typeGroups.map(({ label, keys, color }) => {
            const count = keys.reduce((sum, k) => sum + (stats.byType[k as keyof typeof stats.byType] ?? 0), 0);
            const max = Math.max(...typeGroups.map(({ keys: ks }) =>
              ks.reduce((s, k) => s + (stats.byType[k as keyof typeof stats.byType] ?? 0), 0)
            ), 1);
            return (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">{label}</span>
                  <span className="text-xs font-bold text-slate-300">{count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5">
                  <div className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${(count / max) * 100}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Confidence distribution */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Confidence Distribution</h3>
          {stats.confidenceDistribution.map(({ range, count }) => (
            <div key={range} className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 w-16 shrink-0">{range}%</span>
              <div className="flex-1 h-4 rounded bg-white/5 relative overflow-hidden">
                <div
                  className="h-4 rounded transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (count / Math.max(stats.totalInsightsExtracted, 1)) * 100)}%`,
                    background: range.startsWith('9') ? '#22c55e' : range.startsWith('7') ? '#D4AF37' : '#94a3b8',
                  }}
                />
              </div>
              <span className="text-[10px] font-bold text-slate-400 w-8 text-right shrink-0">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <TopList title="Top Objections" items={stats.topObjections} color="text-red-400" icon="🛡️" />
        <TopList title="Top Medications" items={stats.topMedications} color="text-purple-400" icon="💊" />
        <TopList title="Top Buying Signals" items={stats.topBuyingSignals} color="text-green-400" icon="🟢" />
      </div>

      {/* Activity chart */}
      {stats.recentActivity.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">14-Day Activity</h3>
          <ActivityChart data={stats.recentActivity} />
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, accent, green }: { label: string; value: number; accent?: boolean; green?: boolean }) {
  return (
    <div className="glass-card rounded-xl p-3 text-center">
      <p className={`text-xl font-extrabold ${accent ? 'text-[#D4AF37]' : green ? 'text-green-400' : 'text-slate-200'}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-[9px] text-slate-600 leading-tight mt-0.5">{label}</p>
    </div>
  );
}

function TopList({ title, items, color, icon }: { title: string; items: { text: string; count: number }[]; color: string; icon: string }) {
  return (
    <div className="glass-card rounded-2xl p-5 space-y-3">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <span>{icon}</span>{title}
      </h3>
      {items.length === 0 && <p className="text-xs text-slate-700">No data yet</p>}
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-700 w-4 shrink-0">{i + 1}</span>
          <span className="text-xs text-slate-300 flex-1 truncate">{item.text}</span>
          <span className={`text-[10px] font-bold shrink-0 ${color}`}>{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityChart({ data }: { data: { date: string; processed: number; approved: number }[] }) {
  const maxProcessed = Math.max(...data.map((d) => d.processed), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div className="w-full flex flex-col items-center gap-0.5" style={{ height: '80px', justifyContent: 'flex-end' }}>
            <div
              className="w-full rounded-t transition-all duration-500 bg-[rgba(212,175,55,0.3)]"
              style={{ height: `${(d.processed / maxProcessed) * 72}px`, minHeight: d.processed > 0 ? 2 : 0 }}
            />
          </div>
          <span className="text-[7px] text-slate-700 hidden group-hover:block absolute -top-5 whitespace-nowrap bg-slate-900 px-1 py-0.5 rounded z-10">
            {d.date}: {d.processed} processed, {d.approved} approved
          </span>
          <span className="text-[7px] text-slate-700">
            {d.date.split('-').slice(1).join('/')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Search Tab
// ─────────────────────────────────────────────────────────────────────────────

function SearchTab() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('approved');
  const [typeFilter, setTypeFilter] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [page, setPage] = useState(1);

  const search = useCallback(async (q: string, p = 1) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q, page: String(p), pageSize: '30' });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      const res = await fetch(`/api/pipeline/search?${params}`);
      if (res.ok) {
        const d = await res.json() as { results: SearchResult[]; total: number };
        setResults(d.results);
        setTotal(d.total);
        setPage(p);
      }
    } finally {
      setIsSearching(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (query.length >= 2 || query.length === 0) {
      const t = setTimeout(() => search(query), 300);
      return () => clearTimeout(t);
    }
  }, [query, search]);

  const highlighted = (text: string) =>
    text.replace(/\*\*(.+?)\*\*/g, '<mark class="bg-[rgba(212,175,55,0.25)] text-[#D4AF37] rounded px-0.5">$1</mark>');

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      {/* Search input */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-sm">⌕</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by medication, objection, carrier, technique, keyword…"
            className="w-full bg-white/5 border border-white/8 rounded-xl pl-8 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
          />
          {isSearching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-[#D4AF37] border-t-transparent animate-spin" />}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none"
        >
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <p className="text-[10px] text-slate-600">{total > 0 ? `${total} results` : query ? 'No results' : 'Type to search'}</p>

      {/* Results */}
      <div className="space-y-3">
        {results.map(({ entry, highlights }) => (
          <div key={entry.id} className="glass-card rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${TYPE_COLORS[entry.type] ?? TYPE_COLORS.default}`}>
                {TYPE_LABELS[entry.type] ?? entry.type}
              </span>
              <span className="text-[9px] text-slate-600 border border-white/8 bg-white/4 px-2 py-0.5 rounded-full">
                {entry.targetFile?.replace(/_/g, ' ')}
              </span>
              <span className="ml-auto text-[10px] font-bold" style={{ color: scoreColor(entry.confidence) }}>
                {entry.confidence}%
              </span>
              <StatusDot status={entry.status} />
            </div>
            <p
              className="text-sm text-slate-200"
              dangerouslySetInnerHTML={{ __html: highlighted(highlights.summary ?? entry.summary) }}
            />
            {highlights.evidence && (
              <blockquote
                className="border-l-2 border-white/10 pl-3 text-xs text-slate-500 italic"
                dangerouslySetInnerHTML={{ __html: highlighted(highlights.evidence) }}
              />
            )}
            <div className="flex flex-wrap gap-1">
              {entry.tags?.map((tag) => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/4 text-slate-600 border border-white/6">{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {total > 30 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <button onClick={() => search(query, page - 1)} className="px-3 py-1.5 rounded-lg text-xs bg-white/6 text-slate-400 hover:bg-white/10">← Prev</button>
          )}
          {page * 30 < total && (
            <button onClick={() => search(query, page + 1)} className="px-3 py-1.5 rounded-lg text-xs bg-white/6 text-slate-400 hover:bg-white/10">Next →</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared micro-components
// ─────────────────────────────────────────────────────────────────────────────

function StatChip({ label, value, accent, green }: { label: string; value: number; accent?: boolean; green?: boolean }) {
  return (
    <div className="text-center px-3 py-1 rounded-lg bg-white/4 border border-white/6">
      <p className={`text-sm font-bold ${accent ? 'text-[#D4AF37]' : green ? 'text-green-400' : 'text-slate-200'}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-[9px] text-slate-600">{label}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-amber-400', approved: 'bg-green-400', rejected: 'bg-red-400',
  };
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[status] ?? 'bg-slate-600'}`} />;
}

function ChevronDownIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg className={`w-3.5 h-3.5 text-slate-600 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function UploadCloudIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-8 h-8 transition-colors ${active ? 'text-[#D4AF37]' : 'text-slate-600'}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 0 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
