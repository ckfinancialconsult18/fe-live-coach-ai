-- ─────────────────────────────────────────────────────────────────────────────
-- Extend documents: carrier association, folders, tags, versioning, virus-scan
-- status placeholder, and full-text search.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.documents
  add column if not exists carrier_id      uuid references public.carriers(id) on delete set null,
  add column if not exists folder          text not null default 'general',
  add column if not exists tags            text[] not null default '{}',
  add column if not exists version         int not null default 1,
  add column if not exists scan_status     text not null default 'pending' check (scan_status in ('pending', 'clean', 'flagged', 'error')),
  add column if not exists original_filename text,
  add column if not exists updated_at      timestamptz not null default now();

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create index if not exists documents_carrier_id_idx on public.documents(carrier_id);
create index if not exists documents_folder_idx on public.documents(folder);
create index if not exists documents_scan_status_idx on public.documents(scan_status);

-- search_vector: plain column + trigger, not a GENERATED ALWAYS column.
-- to_tsvector('english', ...) cannot be used in a generated column because
-- the text->regconfig cast (even written explicitly as ::regconfig) is
-- STABLE, not IMMUTABLE, in Postgres — generated columns require a provably
-- immutable expression. This is the standard Postgres/Supabase-safe pattern.
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

update public.documents
set search_vector = to_tsvector('english', coalesce(name, '') || ' ' || coalesce(array_to_string(tags, ' '), ''))
where search_vector is null;

create index if not exists documents_search_idx on public.documents using gin(search_vector);

-- ─────────────────────────────────────────────────────────────────────────────
-- document_versions — append-only version history. A new upload to an
-- existing document inserts a row here and bumps documents.version, rather
-- than overwriting the storage object in place.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.document_versions (
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

create index document_versions_document_id_idx on public.document_versions(document_id);

alter table public.document_versions enable row level security;

create policy "document_versions_select_own"
  on public.document_versions for select
  using (auth.uid() = user_id);

create policy "document_versions_insert_own"
  on public.document_versions for insert
  with check (auth.uid() = user_id);

create policy "document_versions_delete_own"
  on public.document_versions for delete
  using (auth.uid() = user_id);
