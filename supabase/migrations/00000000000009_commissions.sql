-- ─────────────────────────────────────────────────────────────────────────────
-- commissions — policy commission tracking
-- ─────────────────────────────────────────────────────────────────────────────

create table public.commissions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  policy_number   text,
  client_name     text not null,
  carrier         text not null,
  policy_type     text not null check (
                    policy_type in ('final_expense', 'mortgage_protection', 'term', 'whole_life', 'universal_life')
                  ),
  face_amount     numeric(12, 2),
  premium         numeric(12, 2),
  amount          numeric(12, 2) not null,
  commission_rate numeric(5, 2),
  status          text not null default 'pending' check (status in ('paid', 'pending', 'chargeback')),
  paid_date       date,
  month           text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index commissions_user_id_idx on public.commissions(user_id);
create index commissions_month_idx on public.commissions(month);
create index commissions_status_idx on public.commissions(status);

create trigger commissions_set_updated_at
  before update on public.commissions
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.commissions enable row level security;

create policy "commissions_select_own"
  on public.commissions for select
  using (auth.uid() = user_id);

create policy "commissions_insert_own"
  on public.commissions for insert
  with check (auth.uid() = user_id);

create policy "commissions_update_own"
  on public.commissions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "commissions_delete_own"
  on public.commissions for delete
  using (auth.uid() = user_id);
