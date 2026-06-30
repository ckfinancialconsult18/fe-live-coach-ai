-- ─────────────────────────────────────────────────────────────────────────────
-- pipeline_logs — system-level processing telemetry, distinct from audit_logs
-- (which is the security/user-action trail). Tracks ingestion, embedding,
-- queue, and search-latency events for monitoring/debugging.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.pipeline_logs (
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

create index pipeline_logs_user_id_idx on public.pipeline_logs(user_id, created_at desc);
create index pipeline_logs_event_type_idx on public.pipeline_logs(event_type);

alter table public.pipeline_logs enable row level security;

create policy "pipeline_logs_select_own"
  on public.pipeline_logs for select using (auth.uid() = user_id);
create policy "pipeline_logs_insert_own"
  on public.pipeline_logs for insert with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Keyword search support on knowledge_documents (complements the semantic
-- pgvector search on knowledge_chunks) for hybrid ranking.
-- ─────────────────────────────────────────────────────────────────────────────

-- search_vector: plain column + trigger, not a GENERATED ALWAYS column —
-- see the matching note in migration 20 for why (to_tsvector's regconfig
-- cast is STABLE, not IMMUTABLE, so it can't be used in a generated column).
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
