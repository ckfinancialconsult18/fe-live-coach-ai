-- ─────────────────────────────────────────────────────────────────────────────
-- tasks — agent to-do list, optionally linked to a lead/contact/policy
-- ─────────────────────────────────────────────────────────────────────────────

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  title         text not null,
  description   text,
  due_date      date,
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  completed     boolean not null default false,
  related_to    uuid,
  related_type  text check (related_type in ('lead', 'client', 'contact', 'policy')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index tasks_user_id_idx on public.tasks(user_id);
create index tasks_due_date_idx on public.tasks(due_date);
create index tasks_completed_idx on public.tasks(completed);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.tasks enable row level security;

create policy "tasks_select_own"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "tasks_insert_own"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "tasks_update_own"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tasks_delete_own"
  on public.tasks for delete
  using (auth.uid() = user_id);
