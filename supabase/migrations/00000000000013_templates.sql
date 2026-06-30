-- ─────────────────────────────────────────────────────────────────────────────
-- templates — email / SMS templates with merge fields
-- ─────────────────────────────────────────────────────────────────────────────

create table public.templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  name          text not null,
  type          text not null default 'email' check (type in ('email', 'sms')),
  subject       text,
  body          text not null,
  merge_fields  text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index templates_user_id_idx on public.templates(user_id);
create index templates_type_idx on public.templates(type);

create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.templates enable row level security;

create policy "templates_select_own"
  on public.templates for select
  using (auth.uid() = user_id);

create policy "templates_insert_own"
  on public.templates for insert
  with check (auth.uid() = user_id);

create policy "templates_update_own"
  on public.templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "templates_delete_own"
  on public.templates for delete
  using (auth.uid() = user_id);
