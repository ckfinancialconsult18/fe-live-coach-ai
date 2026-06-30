-- ─────────────────────────────────────────────────────────────────────────────
-- reports — generated/cached analytics snapshots (weekly performance, etc.)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  report_type   text not null check (report_type in ('weekly', 'monthly', 'analytics', 'custom')),
  period_start  date not null,
  period_end    date not null,
  data          jsonb not null default '{}'::jsonb,
  generated_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index reports_user_id_idx on public.reports(user_id);
create index reports_period_idx on public.reports(period_start, period_end);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.reports enable row level security;

create policy "reports_select_own"
  on public.reports for select
  using (auth.uid() = user_id);

create policy "reports_insert_own"
  on public.reports for insert
  with check (auth.uid() = user_id);

create policy "reports_update_own"
  on public.reports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reports_delete_own"
  on public.reports for delete
  using (auth.uid() = user_id);
