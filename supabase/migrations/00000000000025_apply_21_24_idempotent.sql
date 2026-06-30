-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent re-application of migrations 21–24 only.
-- Safe to run even if some objects from this range already partially exist —
-- every CREATE is guarded (IF NOT EXISTS, or DROP ... IF EXISTS + CREATE for
-- objects that don't support IF NOT EXISTS natively: policies, triggers).
-- Does NOT touch users/contacts/leads/appointments/calls/call_scores/
-- reports/commissions/tasks/documents(base)/knowledge_base/templates/settings
-- — those already exist and are left alone.
--
-- NOTE on full-text search columns: `to_tsvector('english', ...)` cannot be
-- used in a GENERATED ALWAYS AS (...) STORED column. Even with an explicit
-- `::regconfig` cast, Postgres classifies the text->regconfig cast function
-- (regconfigin) as STABLE, not IMMUTABLE, because it depends on a catalog
-- lookup — and generated columns require a provably IMMUTABLE expression.
-- This is a hard PostgreSQL 17 / Supabase constraint, not a workaround-able
-- syntax issue. The fix used below: a plain (non-generated) tsvector column,
-- kept in sync by a BEFORE INSERT OR UPDATE trigger, plus a one-time backfill
-- for any existing rows. This is the standard production-safe pattern for
-- full-text search columns and is what Supabase's own docs recommend.
-- ─────────────────────────────────────────────────────────────────────────────

-- Fail fast with a clear message if carriers/policies (migrations 17-18)
-- haven't been applied yet — knowledge_documents and the re-applied
-- documents.carrier_id column below both have a foreign key to carriers.
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'carriers') then
    raise exception 'public.carriers does not exist. Run migrations 16-19 (clients_fields, carriers, policies, audit/notifications/activity) before this one.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 21: pgvector + knowledge RAG schema
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists vector;

-- ── knowledge_categories ────────────────────────────────────────────────────
create table if not exists public.knowledge_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  parent_id   uuid references public.knowledge_categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, parent_id, name)
);

create index if not exists knowledge_categories_user_id_idx on public.knowledge_categories(user_id);
create index if not exists knowledge_categories_parent_id_idx on public.knowledge_categories(parent_id);

alter table public.knowledge_categories enable row level security;

drop policy if exists "knowledge_categories_select_own" on public.knowledge_categories;
create policy "knowledge_categories_select_own"
  on public.knowledge_categories for select using (auth.uid() = user_id);

drop policy if exists "knowledge_categories_insert_own" on public.knowledge_categories;
create policy "knowledge_categories_insert_own"
  on public.knowledge_categories for insert with check (auth.uid() = user_id);

drop policy if exists "knowledge_categories_update_own" on public.knowledge_categories;
create policy "knowledge_categories_update_own"
  on public.knowledge_categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "knowledge_categories_delete_own" on public.knowledge_categories;
create policy "knowledge_categories_delete_own"
  on public.knowledge_categories for delete using (auth.uid() = user_id);

-- ── knowledge_documents ──────────────────────────────────────────────────────
-- Requires public.carriers to exist (FK). If migrations 16-18 were not
-- applied yet, this statement will fail with "relation carriers does not
-- exist" — run those first if so.
create table if not exists public.knowledge_documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  category_id     uuid references public.knowledge_categories(id) on delete set null,
  carrier_id      uuid references public.carriers(id) on delete set null,
  title           text not null,
  source_type     text not null check (source_type in (
                    'carrier_guide', 'underwriting_manual', 'script', 'objection_handling',
                    'closing_technique', 'compliance', 'product_doc', 'training', 'other'
                  )),
  storage_path    text,
  mime_type       text,
  file_size       bigint,
  raw_text        text,
  status          text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  version         int not null default 1,
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists knowledge_documents_user_id_idx on public.knowledge_documents(user_id);
create index if not exists knowledge_documents_category_id_idx on public.knowledge_documents(category_id);
create index if not exists knowledge_documents_status_idx on public.knowledge_documents(status);
create index if not exists knowledge_documents_source_type_idx on public.knowledge_documents(source_type);

drop trigger if exists knowledge_documents_set_updated_at on public.knowledge_documents;
create trigger knowledge_documents_set_updated_at
  before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

alter table public.knowledge_documents enable row level security;

drop policy if exists "knowledge_documents_select_own" on public.knowledge_documents;
create policy "knowledge_documents_select_own"
  on public.knowledge_documents for select using (auth.uid() = user_id);

drop policy if exists "knowledge_documents_insert_own" on public.knowledge_documents;
create policy "knowledge_documents_insert_own"
  on public.knowledge_documents for insert with check (auth.uid() = user_id);

drop policy if exists "knowledge_documents_update_own" on public.knowledge_documents;
create policy "knowledge_documents_update_own"
  on public.knowledge_documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "knowledge_documents_delete_own" on public.knowledge_documents;
create policy "knowledge_documents_delete_own"
  on public.knowledge_documents for delete using (auth.uid() = user_id);

-- ── knowledge_chunks ─────────────────────────────────────────────────────────
create table if not exists public.knowledge_chunks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  document_id         uuid references public.knowledge_documents(id) on delete cascade,
  knowledge_base_id   uuid references public.knowledge_base(id) on delete cascade,
  chunk_index         int not null default 0,
  content             text not null,
  token_count         int,
  embedding           vector(1536),
  created_at          timestamptz not null default now(),
  constraint knowledge_chunks_source_check check (
    (document_id is not null and knowledge_base_id is null) or
    (document_id is null and knowledge_base_id is not null)
  )
);

create index if not exists knowledge_chunks_user_id_idx on public.knowledge_chunks(user_id);
create index if not exists knowledge_chunks_document_id_idx on public.knowledge_chunks(document_id);
create index if not exists knowledge_chunks_knowledge_base_id_idx on public.knowledge_chunks(knowledge_base_id);
create index if not exists knowledge_chunks_embedding_idx on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.knowledge_chunks enable row level security;

drop policy if exists "knowledge_chunks_select_own" on public.knowledge_chunks;
create policy "knowledge_chunks_select_own"
  on public.knowledge_chunks for select using (auth.uid() = user_id);

drop policy if exists "knowledge_chunks_insert_own" on public.knowledge_chunks;
create policy "knowledge_chunks_insert_own"
  on public.knowledge_chunks for insert with check (auth.uid() = user_id);

drop policy if exists "knowledge_chunks_update_own" on public.knowledge_chunks;
create policy "knowledge_chunks_update_own"
  on public.knowledge_chunks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "knowledge_chunks_delete_own" on public.knowledge_chunks;
create policy "knowledge_chunks_delete_own"
  on public.knowledge_chunks for delete using (auth.uid() = user_id);

-- ── embedding_queue ──────────────────────────────────────────────────────────
create table if not exists public.embedding_queue (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  target_type   text not null check (target_type in ('knowledge_document', 'knowledge_base')),
  target_id     uuid not null,
  status        text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts      int not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index if not exists embedding_queue_status_idx on public.embedding_queue(status);
create index if not exists embedding_queue_user_id_idx on public.embedding_queue(user_id);

alter table public.embedding_queue enable row level security;

drop policy if exists "embedding_queue_select_own" on public.embedding_queue;
create policy "embedding_queue_select_own"
  on public.embedding_queue for select using (auth.uid() = user_id);

drop policy if exists "embedding_queue_insert_own" on public.embedding_queue;
create policy "embedding_queue_insert_own"
  on public.embedding_queue for insert with check (auth.uid() = user_id);

drop policy if exists "embedding_queue_update_own" on public.embedding_queue;
create policy "embedding_queue_update_own"
  on public.embedding_queue for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "embedding_queue_delete_own" on public.embedding_queue;
create policy "embedding_queue_delete_own"
  on public.embedding_queue for delete using (auth.uid() = user_id);

-- ── search_analytics ─────────────────────────────────────────────────────────
create table if not exists public.search_analytics (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  query             text not null,
  result_count      int not null default 0,
  clicked_chunk_id  uuid references public.knowledge_chunks(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists search_analytics_user_id_idx on public.search_analytics(user_id, created_at desc);

alter table public.search_analytics enable row level security;

drop policy if exists "search_analytics_select_own" on public.search_analytics;
create policy "search_analytics_select_own"
  on public.search_analytics for select using (auth.uid() = user_id);

drop policy if exists "search_analytics_insert_own" on public.search_analytics;
create policy "search_analytics_insert_own"
  on public.search_analytics for insert with check (auth.uid() = user_id);

-- ── coaching_history ─────────────────────────────────────────────────────────
create table if not exists public.coaching_history (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  stats             jsonb not null default '{}',
  recommendations   jsonb not null default '[]',
  created_at        timestamptz not null default now()
);

create index if not exists coaching_history_user_id_idx on public.coaching_history(user_id, created_at desc);

alter table public.coaching_history enable row level security;

drop policy if exists "coaching_history_select_own" on public.coaching_history;
create policy "coaching_history_select_own"
  on public.coaching_history for select using (auth.uid() = user_id);

drop policy if exists "coaching_history_insert_own" on public.coaching_history;
create policy "coaching_history_insert_own"
  on public.coaching_history for insert with check (auth.uid() = user_id);

-- ── match_knowledge_chunks RPC ───────────────────────────────────────────────
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 6,
  min_similarity float default 0.5
)
returns table (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  knowledge_base_id uuid
)
language sql stable
security invoker
as $$
  select
    kc.id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity,
    kc.document_id,
    kc.knowledge_base_id
  from public.knowledge_chunks kc
  where kc.user_id = match_user_id
    and kc.embedding is not null
    and 1 - (kc.embedding <=> query_embedding) >= min_similarity
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- ── knowledge storage bucket ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 26214400, array[
  'application/pdf', 'text/plain', 'text/markdown',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do nothing;

drop policy if exists "knowledge_storage_owner_all" on storage.objects;
create policy "knowledge_storage_owner_all"
  on storage.objects for all
  using (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 20 (included here too): document_versions did not exist per
-- your check, which means migration 20 likely never fully applied either.
-- Re-applying its contents idempotently so document_versions + the documents
-- column extensions it depends on are both present.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.documents
  add column if not exists carrier_id      uuid references public.carriers(id) on delete set null,
  add column if not exists folder          text not null default 'general',
  add column if not exists tags            text[] not null default '{}',
  add column if not exists version         int not null default 1,
  add column if not exists scan_status     text not null default 'pending' check (scan_status in ('pending', 'clean', 'flagged', 'error')),
  add column if not exists original_filename text,
  add column if not exists updated_at      timestamptz not null default now();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create index if not exists documents_carrier_id_idx on public.documents(carrier_id);
create index if not exists documents_folder_idx on public.documents(folder);
create index if not exists documents_scan_status_idx on public.documents(scan_status);

-- search_vector: plain column + trigger (see note at top of file for why this
-- replaces a GENERATED ALWAYS AS column).
alter table public.documents
  add column if not exists search_vector tsvector;

create or replace function public.documents_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := to_tsvector('english', coalesce(new.name, '') || ' ' || coalesce(array_to_string(new.tags, ' '), ''));
  return new;
end;
$$;

drop trigger if exists documents_search_vector_trigger on public.documents;
create trigger documents_search_vector_trigger
  before insert or update of name, tags on public.documents
  for each row execute function public.documents_search_vector_update();

-- Backfill any existing rows (and any inserted before the trigger existed).
update public.documents
set search_vector = to_tsvector('english', coalesce(name, '') || ' ' || coalesce(array_to_string(tags, ' '), ''))
where search_vector is null;

create index if not exists documents_search_idx on public.documents using gin(search_vector);

create table if not exists public.document_versions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  version       int not null,
  storage_path  text not null,
  file_size     bigint,
  mime_type     text,
  created_at    timestamptz not null default now(),
  unique (document_id, version)
);

create index if not exists document_versions_document_id_idx on public.document_versions(document_id);

alter table public.document_versions enable row level security;

drop policy if exists "document_versions_select_own" on public.document_versions;
create policy "document_versions_select_own"
  on public.document_versions for select
  using (auth.uid() = user_id);

drop policy if exists "document_versions_insert_own" on public.document_versions;
create policy "document_versions_insert_own"
  on public.document_versions for insert
  with check (auth.uid() = user_id);

drop policy if exists "document_versions_delete_own" on public.document_versions;
create policy "document_versions_delete_own"
  on public.document_versions for delete
  using (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 22: document duplicate detection
-- ════════════════════════════════════════════════════════════════════════════

alter table public.documents
  add column if not exists file_hash text;

create index if not exists documents_user_hash_idx on public.documents(user_id, file_hash);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 23: pipeline_logs + keyword search on knowledge_documents
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.pipeline_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete cascade,
  event_type    text not null check (event_type in (
                  'upload_failure', 'extraction_failure', 'embedding_failure',
                  'queue_failure', 'processing_complete', 'search_latency'
                )),
  target_type   text,
  target_id     uuid,
  duration_ms   int,
  message       text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists pipeline_logs_user_id_idx on public.pipeline_logs(user_id, created_at desc);
create index if not exists pipeline_logs_event_type_idx on public.pipeline_logs(event_type);

alter table public.pipeline_logs enable row level security;

drop policy if exists "pipeline_logs_select_own" on public.pipeline_logs;
create policy "pipeline_logs_select_own"
  on public.pipeline_logs for select using (auth.uid() = user_id);

drop policy if exists "pipeline_logs_insert_own" on public.pipeline_logs;
create policy "pipeline_logs_insert_own"
  on public.pipeline_logs for insert with check (auth.uid() = user_id);

-- search_vector: plain column + trigger (see note at top of file).
alter table public.knowledge_documents
  add column if not exists search_vector tsvector;

create or replace function public.knowledge_documents_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := to_tsvector(
    'english',
    coalesce(new.title, '') || ' ' || coalesce(new.raw_text, '') || ' ' || coalesce(array_to_string(new.tags, ' '), '')
  );
  return new;
end;
$$;

drop trigger if exists knowledge_documents_search_vector_trigger on public.knowledge_documents;
create trigger knowledge_documents_search_vector_trigger
  before insert or update of title, raw_text, tags on public.knowledge_documents
  for each row execute function public.knowledge_documents_search_vector_update();

update public.knowledge_documents
set search_vector = to_tsvector(
  'english',
  coalesce(title, '') || ' ' || coalesce(raw_text, '') || ' ' || coalesce(array_to_string(tags, ' '), '')
)
where search_vector is null;

create index if not exists knowledge_documents_search_idx on public.knowledge_documents using gin(search_vector);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 24: knowledge_jobs
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.knowledge_jobs (
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

create index if not exists knowledge_jobs_user_id_idx on public.knowledge_jobs(user_id, created_at desc);
create index if not exists knowledge_jobs_status_idx on public.knowledge_jobs(status);

alter table public.knowledge_jobs enable row level security;

drop policy if exists "knowledge_jobs_select_own" on public.knowledge_jobs;
create policy "knowledge_jobs_select_own"
  on public.knowledge_jobs for select using (auth.uid() = user_id);

drop policy if exists "knowledge_jobs_insert_own" on public.knowledge_jobs;
create policy "knowledge_jobs_insert_own"
  on public.knowledge_jobs for insert with check (auth.uid() = user_id);

drop policy if exists "knowledge_jobs_update_own" on public.knowledge_jobs;
create policy "knowledge_jobs_update_own"
  on public.knowledge_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "knowledge_jobs_delete_own" on public.knowledge_jobs;
create policy "knowledge_jobs_delete_own"
  on public.knowledge_jobs for delete using (auth.uid() = user_id);

alter table public.knowledge_base
  add column if not exists knowledge_job_id uuid references public.knowledge_jobs(id) on delete set null;

create index if not exists knowledge_base_knowledge_job_id_idx on public.knowledge_base(knowledge_job_id);
