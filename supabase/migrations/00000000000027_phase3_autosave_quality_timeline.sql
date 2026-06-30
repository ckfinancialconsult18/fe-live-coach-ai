-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3: autosave (mid-call resilience), call timeline, and the 12-dimension
-- AI Quality Score radar, on top of the existing calls/call_scores tables.
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── calls: autosave support ─────────────────────────────────────────────────
alter table public.calls
  add column if not exists status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  add column if not exists live_state jsonb not null default '{}'::jsonb;

create index if not exists calls_status_idx on public.calls(status);
-- Speeds up "find my in-progress call to resume" and dashboard "today's calls" queries.
create index if not exists calls_user_status_started_idx on public.calls(user_id, status, started_at desc);

-- ── call_scores: timeline + quality radar + extended report fields ─────────
alter table public.call_scores
  add column if not exists quality_scores jsonb not null default '{}'::jsonb,
  add column if not exists timeline jsonb not null default '[]'::jsonb,
  add column if not exists report_details jsonb not null default '{}'::jsonb;

-- ── Performance: composite indexes for common dashboard/report queries ──────
create index if not exists calls_user_started_idx on public.calls(user_id, started_at desc);
create index if not exists call_scores_overall_score_idx on public.call_scores(overall_score);
