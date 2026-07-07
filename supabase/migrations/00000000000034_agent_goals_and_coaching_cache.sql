-- ─────────────────────────────────────────────────────────────────────────────
-- agent_goals — agent-set performance targets
-- ─────────────────────────────────────────────────────────────────────────────

create table public.agent_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  goal_type   text not null check (goal_type in (
                'calls_per_day', 'appointments_per_day', 'policies_per_day',
                'target_close_rate', 'avg_call_score'
              )),
  target      numeric not null check (target > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, goal_type)
);

create trigger agent_goals_set_updated_at
  before update on public.agent_goals
  for each row execute function public.set_updated_at();

alter table public.agent_goals enable row level security;

create policy "agent_goals_select_own" on public.agent_goals for select using (auth.uid() = user_id);
create policy "agent_goals_insert_own" on public.agent_goals for insert with check (auth.uid() = user_id);
create policy "agent_goals_update_own" on public.agent_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "agent_goals_delete_own" on public.agent_goals for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- coaching_cache — stores AI-generated coaching plans to avoid re-generating
-- on every page load. One row per user per day.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.coaching_cache (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  cache_date   date not null default current_date,
  window_days  int not null default 7,
  plan         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (user_id, cache_date, window_days)
);

alter table public.coaching_cache enable row level security;

create policy "coaching_cache_select_own" on public.coaching_cache for select using (auth.uid() = user_id);
create policy "coaching_cache_insert_own" on public.coaching_cache for insert with check (auth.uid() = user_id);
create policy "coaching_cache_update_own" on public.coaching_cache for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
