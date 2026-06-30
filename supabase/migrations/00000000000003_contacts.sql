-- ─────────────────────────────────────────────────────────────────────────────
-- contacts — unified address book (leads, clients, and everyone in between)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  email         text,
  phone         text,
  age           int,
  dob           date,
  address       text,
  city          text,
  state         text,
  zip           text,
  status        text not null default 'lead' check (status in ('lead', 'client', 'inactive')),
  source        text,
  tags          text[] not null default '{}',
  notes         text,
  existing_coverage text,
  medical_notes text,
  last_call_at  timestamptz,
  score         int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index contacts_user_id_idx on public.contacts(user_id);
create index contacts_status_idx on public.contacts(status);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.contacts enable row level security;

create policy "contacts_select_own"
  on public.contacts for select
  using (auth.uid() = user_id);

create policy "contacts_insert_own"
  on public.contacts for insert
  with check (auth.uid() = user_id);

create policy "contacts_update_own"
  on public.contacts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "contacts_delete_own"
  on public.contacts for delete
  using (auth.uid() = user_id);
