-- ─────────────────────────────────────────────────────────────────────────────
-- Enable pgvector and build the RAG schema: source documents, chunks with
-- embeddings, a background embedding queue, category hierarchy, and search
-- analytics. This replaces the filesystem-backed knowledge pipeline
-- (lib/pipeline/*) as the system of record going forward.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists vector;

-- ── knowledge_categories — hierarchical grouping (e.g. "Carriers" > "Americo") ─
create table public.knowledge_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  parent_id   uuid references public.knowledge_categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, parent_id, name)
);

create index knowledge_categories_user_id_idx on public.knowledge_categories(user_id);
create index knowledge_categories_parent_id_idx on public.knowledge_categories(parent_id);

alter table public.knowledge_categories enable row level security;

create policy "knowledge_categories_select_own"
  on public.knowledge_categories for select using (auth.uid() = user_id);
create policy "knowledge_categories_insert_own"
  on public.knowledge_categories for insert with check (auth.uid() = user_id);
create policy "knowledge_categories_update_own"
  on public.knowledge_categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "knowledge_categories_delete_own"
  on public.knowledge_categories for delete using (auth.uid() = user_id);

-- ── knowledge_documents — reference source material (carrier guides, ────────
-- underwriting manuals, scripts, compliance rules, product docs, training) ──
create table public.knowledge_documents (
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

create index knowledge_documents_user_id_idx on public.knowledge_documents(user_id);
create index knowledge_documents_category_id_idx on public.knowledge_documents(category_id);
create index knowledge_documents_status_idx on public.knowledge_documents(status);
create index knowledge_documents_source_type_idx on public.knowledge_documents(source_type);

create trigger knowledge_documents_set_updated_at
  before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

alter table public.knowledge_documents enable row level security;

create policy "knowledge_documents_select_own"
  on public.knowledge_documents for select using (auth.uid() = user_id);
create policy "knowledge_documents_insert_own"
  on public.knowledge_documents for insert with check (auth.uid() = user_id);
create policy "knowledge_documents_update_own"
  on public.knowledge_documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "knowledge_documents_delete_own"
  on public.knowledge_documents for delete using (auth.uid() = user_id);

-- ── knowledge_chunks — chunked + embedded content. Polymorphic source: ──────
-- either a knowledge_documents row (reference material) or a knowledge_base
-- row (an extracted call insight), so both feed the same retrieval index. ──
create table public.knowledge_chunks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  document_id         uuid references public.knowledge_documents(id) on delete cascade,
  knowledge_base_id   uuid references public.knowledge_base(id) on delete cascade,
  chunk_index         int not null default 0,
  content             text not null,
  token_count         int,
  embedding           vector(1536),
  created_at          timestamptz not null default now(),
  check (
    (document_id is not null and knowledge_base_id is null) or
    (document_id is null and knowledge_base_id is not null)
  )
);

create index knowledge_chunks_user_id_idx on public.knowledge_chunks(user_id);
create index knowledge_chunks_document_id_idx on public.knowledge_chunks(document_id);
create index knowledge_chunks_knowledge_base_id_idx on public.knowledge_chunks(knowledge_base_id);

-- ivfflat approximate-nearest-neighbor index for cosine similarity search.
-- Requires ANALYZE after bulk inserts to build well; fine to create now since
-- ivfflat tolerates an empty table (it just won't be well-tuned until data
-- exists — `lists = 100` is a reasonable default for a single-tenant-per-row
-- table in the thousands-of-chunks range, revisit if it grows past ~1M rows).
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.knowledge_chunks enable row level security;

create policy "knowledge_chunks_select_own"
  on public.knowledge_chunks for select using (auth.uid() = user_id);
create policy "knowledge_chunks_insert_own"
  on public.knowledge_chunks for insert with check (auth.uid() = user_id);
create policy "knowledge_chunks_update_own"
  on public.knowledge_chunks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "knowledge_chunks_delete_own"
  on public.knowledge_chunks for delete using (auth.uid() = user_id);

-- ── embedding_queue — background processing queue. A row is enqueued on ────
-- document upload / knowledge_base insert; a worker (API route invoked by a
-- cron trigger — see note in app/api/knowledge/process-queue) claims pending
-- rows, chunks + embeds them, and writes knowledge_chunks. ──────────────────
create table public.embedding_queue (
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

create index embedding_queue_status_idx on public.embedding_queue(status);
create index embedding_queue_user_id_idx on public.embedding_queue(user_id);

alter table public.embedding_queue enable row level security;

create policy "embedding_queue_select_own"
  on public.embedding_queue for select using (auth.uid() = user_id);
create policy "embedding_queue_insert_own"
  on public.embedding_queue for insert with check (auth.uid() = user_id);
create policy "embedding_queue_update_own"
  on public.embedding_queue for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "embedding_queue_delete_own"
  on public.embedding_queue for delete using (auth.uid() = user_id);

-- ── search_analytics — what agents search for and whether they found it ────
create table public.search_analytics (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  query             text not null,
  result_count      int not null default 0,
  clicked_chunk_id  uuid references public.knowledge_chunks(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index search_analytics_user_id_idx on public.search_analytics(user_id, created_at desc);

alter table public.search_analytics enable row level security;

create policy "search_analytics_select_own"
  on public.search_analytics for select using (auth.uid() = user_id);
create policy "search_analytics_insert_own"
  on public.search_analytics for insert with check (auth.uid() = user_id);

-- ── coaching_history — conversational memory for the Agent Performance ─────
-- Engine. Each row is a snapshot of the stats + recommendations generated at
-- a point in time, so future coaching calls can reference trends instead of
-- only the latest 30-day window. ────────────────────────────────────────────
create table public.coaching_history (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  stats             jsonb not null default '{}',
  recommendations   jsonb not null default '[]',
  created_at        timestamptz not null default now()
);

create index coaching_history_user_id_idx on public.coaching_history(user_id, created_at desc);

alter table public.coaching_history enable row level security;

create policy "coaching_history_select_own"
  on public.coaching_history for select using (auth.uid() = user_id);
create policy "coaching_history_insert_own"
  on public.coaching_history for insert with check (auth.uid() = user_id);

-- ── RPC for cosine-similarity retrieval, callable via supabase-js .rpc() ────
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

-- ── knowledge storage bucket — raw uploaded reference documents ────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 26214400, array[
  'application/pdf', 'text/plain', 'text/markdown',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do nothing;

create policy "knowledge_storage_owner_all"
  on storage.objects for all
  using (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);
