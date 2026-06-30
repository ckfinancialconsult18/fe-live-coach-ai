-- ─────────────────────────────────────────────────────────────────────────────
-- calls — every live/practice call: transcript, underwriting capture, metrics
-- ─────────────────────────────────────────────────────────────────────────────

create table public.calls (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  contact_id        uuid references public.contacts(id) on delete set null,
  lead_id           uuid references public.leads(id) on delete set null,
  call_type         text not null default 'sales' check (call_type in ('sales', 'coaching', 'role_play')),
  outcome           text check (outcome in ('policy_written', 'follow_up', 'not_interested', 'no_answer')),
  duration_seconds  int not null default 0,
  transcript        jsonb not null default '[]'::jsonb,
  underwriting      jsonb not null default '{}'::jsonb,
  metrics           jsonb not null default '{}'::jsonb,
  recording_path    text,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index calls_user_id_idx on public.calls(user_id);
create index calls_contact_id_idx on public.calls(contact_id);
create index calls_started_at_idx on public.calls(started_at desc);

create trigger calls_set_updated_at
  before update on public.calls
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.calls enable row level security;

create policy "calls_select_own"
  on public.calls for select
  using (auth.uid() = user_id);

create policy "calls_insert_own"
  on public.calls for insert
  with check (auth.uid() = user_id);

create policy "calls_update_own"
  on public.calls for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "calls_delete_own"
  on public.calls for delete
  using (auth.uid() = user_id);
