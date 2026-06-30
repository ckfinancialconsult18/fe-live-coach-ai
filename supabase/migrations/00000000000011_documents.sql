-- ─────────────────────────────────────────────────────────────────────────────
-- documents — metadata for files stored in the `documents` storage bucket
-- ─────────────────────────────────────────────────────────────────────────────

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  name          text not null,
  category      text not null default 'other' check (
                  category in ('application', 'policy', 'id', 'medical', 'beneficiary', 'other')
                ),
  storage_path  text not null,
  file_size     bigint,
  mime_type     text,
  created_at    timestamptz not null default now()
);

create index documents_user_id_idx on public.documents(user_id);
create index documents_contact_id_idx on public.documents(contact_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.documents enable row level security;

create policy "documents_select_own"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "documents_insert_own"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "documents_update_own"
  on public.documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "documents_delete_own"
  on public.documents for delete
  using (auth.uid() = user_id);
