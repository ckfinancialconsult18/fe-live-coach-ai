-- ─────────────────────────────────────────────────────────────────────────────
-- knowledge_jobs — tracks call-transcript → insight-extraction processing
-- (the Knowledge Center "Upload" tab), replacing the filesystem job queue.
-- Distinct from embedding_queue (which handles chunk/embed for already-
-- approved knowledge + reference documents).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.knowledge_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  original_name       text not null,
  format              text not null,
  status              text not null default 'queued' check (status in (
                        'queued', 'parsing', 'extracting', 'deduplicating',
                        'pending_review', 'completed', 'failed'
                      )),
  progress            int not null default 0,
  error               text,
  retry_count         int not null default 0,
  word_count          int,
  extracted_count     int,
  new_knowledge_count int,
  call_type           text,
  call_outcome        text,
  call_score          int,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index knowledge_jobs_user_id_idx on public.knowledge_jobs(user_id, created_at desc);
create index knowledge_jobs_status_idx on public.knowledge_jobs(status);

alter table public.knowledge_jobs enable row level security;

create policy "knowledge_jobs_select_own"
  on public.knowledge_jobs for select using (auth.uid() = user_id);
create policy "knowledge_jobs_insert_own"
  on public.knowledge_jobs for insert with check (auth.uid() = user_id);
create policy "knowledge_jobs_update_own"
  on public.knowledge_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "knowledge_jobs_delete_own"
  on public.knowledge_jobs for delete using (auth.uid() = user_id);

-- Link knowledge_base entries back to the job that produced them (the column
-- already exists as text `job_id` from migration 12 — add a real FK-friendly
-- uuid column alongside it for joins, keeping job_id as a free-text label for
-- backward compat with any already-approved rows).
alter table public.knowledge_base
  add column if not exists knowledge_job_id uuid references public.knowledge_jobs(id) on delete set null;

create index if not exists knowledge_base_knowledge_job_id_idx on public.knowledge_base(knowledge_job_id);
