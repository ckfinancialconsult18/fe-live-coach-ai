-- ─────────────────────────────────────────────────────────────────────────────
-- appointments — calendar entries, optionally linked to a contact or lead
-- ─────────────────────────────────────────────────────────────────────────────

create table public.appointments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  title         text not null,
  description   text,
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  type          text not null default 'phone' check (type in ('phone', 'video', 'in_person')),
  status        text not null default 'scheduled' check (
                  status in ('scheduled', 'completed', 'cancelled', 'no_show')
                ),
  location      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index appointments_user_id_idx on public.appointments(user_id);
create index appointments_start_time_idx on public.appointments(start_time);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.appointments enable row level security;

create policy "appointments_select_own"
  on public.appointments for select
  using (auth.uid() = user_id);

create policy "appointments_insert_own"
  on public.appointments for insert
  with check (auth.uid() = user_id);

create policy "appointments_update_own"
  on public.appointments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "appointments_delete_own"
  on public.appointments for delete
  using (auth.uid() = user_id);
