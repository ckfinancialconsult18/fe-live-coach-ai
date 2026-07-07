'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type VideoStatus =
  | 'queued' | 'downloading' | 'extracting_audio'
  | 'transcribing' | 'building_knowledge' | 'embedding' | 'complete' | 'error';

interface VideoJob {
  id: string;
  title: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
  channel_name: string | null;
  duration_sec: number | null;
  category: string;
  tags: string[];
  status: VideoStatus;
  progress: number;
  error_message: string | null;
  ai_summary: string | null;
  key_takeaways: string[] | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_LABELS: Record<VideoStatus, string> = {
  queued: 'Queued',
  downloading: 'Downloading…',
  extracting_audio: 'Extracting audio…',
  transcribing: 'Transcribing…',
  building_knowledge: 'Building knowledge…',
  embedding: 'Embedding…',
  complete: 'Complete',
  error: 'Error',
};

const STATUS_COLOR: Record<VideoStatus, string> = {
  queued: '#64748b',
  downloading: '#D4AF37',
  extracting_audio: '#D4AF37',
  transcribing: '#D4AF37',
  building_knowledge: '#D4AF37',
  embedding: '#D4AF37',
  complete: '#22c55e',
  error: '#ef4444',
};

const ACTIVE_STATUSES = new Set<VideoStatus>(['queued', 'downloading', 'extracting_audio', 'transcribing', 'building_knowledge', 'embedding']);

function formatDuration(secs: number | null): string {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoBuilder() {
  const [videos, setVideos] = useState<VideoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('General Sales');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge/video/list');
      if (!res.ok) return;
      const data = await res.json();
      setVideos(data.videos ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Poll while any video is active
  useEffect(() => {
    const hasActive = videos.some((v) => ACTIVE_STATUSES.has(v.status));
    if (hasActive) {
      pollRef.current = setInterval(fetchVideos, 3000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [videos, fetchVideos]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/knowledge/video/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), category }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? 'Failed to queue video');
      } else {
        setUrl('');
        await fetchVideos();
      }
    } catch {
      setSubmitError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/knowledge/video/${id}`, { method: 'DELETE' });
    if (res.ok) setVideos((prev) => prev.filter((v) => v.id !== id));
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const text = e.dataTransfer.getData('text/plain').trim();
    if (text.includes('youtube.com') || text.includes('youtu.be')) {
      setUrl(text);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Input card */}
      <div
        className={`glass-card rounded-2xl p-5 transition-colors ${dragOver ? 'border border-[#D4AF37]/40 bg-[#D4AF37]/4' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-[#D4AF37]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">Add YouTube Video</h3>
            <p className="text-xs text-slate-500 mt-0.5">Paste a YouTube URL or playlist — AI will transcribe and extract sales knowledge automatically</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]/40 focus:ring-1 focus:ring-[#D4AF37]/20 transition-colors"
              disabled={submitting}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-[#D4AF37]/40 transition-colors cursor-pointer"
              disabled={submitting}
            >
              {['General Sales', 'Objection Handling', 'Closing', 'Mindset', 'Product Knowledge', 'Compliance'].map((c) => (
                <option key={c} value={c} className="bg-slate-900">{c}</option>
              ))}
            </select>
          </div>

          {submitError && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !url.trim()}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-[#D4AF37] text-slate-950 hover:bg-[#e8c547] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Queueing…' : 'Add to Knowledge Base'}
          </button>
        </form>

        {dragOver && (
          <div className="mt-3 text-center text-xs text-[#D4AF37]/70">Drop YouTube URL here</div>
        )}
      </div>

      {/* Video list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37] animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
              <path d="M10 10l4-2-4-2v4z" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-400">No videos yet</p>
          <p className="text-xs text-slate-600 mt-1">Add a YouTube URL above to start building your video knowledge base</p>
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              expanded={expanded === video.id}
              onToggle={() => setExpanded(expanded === video.id ? null : video.id)}
              onDelete={() => handleDelete(video.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoCard({ video, expanded, onToggle, onDelete }: {
  video: VideoJob;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isActive = ACTIVE_STATUSES.has(video.status);
  const statusColor = STATUS_COLOR[video.status];

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt="" className="w-16 h-10 rounded-lg object-cover shrink-0 bg-white/5" />
        ) : (
          <div className="w-16 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-slate-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-200 truncate">{video.title ?? video.youtube_url ?? 'Video'}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {video.channel_name && <span className="text-[11px] text-slate-500 truncate">{video.channel_name}</span>}
            {video.duration_sec && <span className="text-[11px] text-slate-600">{formatDuration(video.duration_sec)}</span>}
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-500">{video.category}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status badge */}
          <div className="flex items-center gap-1.5">
            {isActive && (
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: statusColor }} />
            )}
            <span className="text-[11px] font-medium" style={{ color: statusColor }}>
              {STATUS_LABELS[video.status]}
            </span>
          </div>

          {/* Expand button (only for complete videos with summaries) */}
          {video.status === 'complete' && video.ai_summary && (
            <button
              onClick={onToggle}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
            >
              <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          )}

          <button
            onClick={onDelete}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="px-4 pb-3">
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${video.progress}%`, background: statusColor }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {video.status === 'error' && video.error_message && (
        <div className="px-4 pb-3">
          <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{video.error_message}</p>
        </div>
      )}

      {/* Expanded knowledge panel */}
      {expanded && video.status === 'complete' && (
        <div className="border-t border-white/6 px-4 py-4 space-y-4">
          {video.ai_summary && (
            <div>
              <p className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider mb-1.5">AI Summary</p>
              <p className="text-sm text-slate-300 leading-relaxed">{video.ai_summary}</p>
            </div>
          )}
          {video.key_takeaways && video.key_takeaways.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider mb-2">Key Takeaways</p>
              <ul className="space-y-1.5">
                {video.key_takeaways.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-[#D4AF37] mt-0.5 shrink-0">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {video.tags && video.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {video.tags.map((tag) => (
                <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#D4AF37]/80 border border-[#D4AF37]/15">
                  {tag.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
