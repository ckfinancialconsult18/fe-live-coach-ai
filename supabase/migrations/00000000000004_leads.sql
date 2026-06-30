-- ─────────────────────────────────────────────────────────────────────────────
-- leads — sales pipeline (separate from contacts so the funnel can be tracked
-- independently of an already-converted client)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  first_name    text not null,
  last_name     text not null,
  email         text,
  phone         text,
  status        text not null default 'new' check (
                  status in ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost')
                ),
  source        text,
  tags          text[] not null default '{}',
  notes         text,
  assigned_to   uuid references public.users(id) on delete set null,
  age           int,
  state         text,
  city          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index leads_user_id_idx on public.leads(user_id);
create index leads_status_idx on public.leads(status);
create index leads_contact_id_idx on public.leads(contact_id);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.leads enable row level security;

create policy "leads_select_own"
  on public.leads for select
  using (auth.uid() = user_id);

create policy "leads_insert_own"
  on public.leads for insert
  with check (auth.uid() = user_id);

create policy "leads_update_own"
  on public.leads for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "leads_delete_own"
  on public.leads for delete
  using (auth.uid() = user_id);
