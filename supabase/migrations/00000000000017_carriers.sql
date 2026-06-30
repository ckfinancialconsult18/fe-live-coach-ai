-- ─────────────────────────────────────────────────────────────────────────────
-- carriers — reference data for the insurance carriers an agent works with.
-- Shared per-user (each agent maintains their own carrier book, since contact
-- info / commission schedules differ by agent contract).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.carriers (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  name                  text not null,
  naic                  text,
  customer_service_phone text,
  agent_support_phone    text,
  underwriting_contact   text,
  commission_schedule    jsonb not null default '{}',
  products              text[] not null default '{}',
  states_available      text[] not null default '{}',
  application_link      text,
  training_docs_url     text,
  website               text,
  contact_name           text,
  contact_email          text,
  notes                 text,
  active_contracts      int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, name)
);

create index carriers_user_id_idx on public.carriers(user_id);

create trigger carriers_set_updated_at
  before update on public.carriers
  for each row execute function public.set_updated_at();

alter table public.carriers enable row level security;

create policy "carriers_select_own"
  on public.carriers for select
  using (auth.uid() = user_id);

create policy "carriers_insert_own"
  on public.carriers for insert
  with check (auth.uid() = user_id);

create policy "carriers_update_own"
  on public.carriers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "carriers_delete_own"
  on public.carriers for delete
  using (auth.uid() = user_id);
