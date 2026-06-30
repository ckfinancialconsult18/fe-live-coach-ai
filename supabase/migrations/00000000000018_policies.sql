-- ─────────────────────────────────────────────────────────────────────────────
-- policies — written insurance policies. References contacts (the client) and
-- carriers (FK instead of free-text carrier name on commissions going forward).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.policies (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  contact_id          uuid references public.contacts(id) on delete set null,
  carrier_id          uuid references public.carriers(id) on delete set null,
  carrier_name        text not null,
  product             text not null,
  policy_type         text not null check (
                        policy_type in ('final_expense', 'mortgage_protection', 'term', 'whole_life', 'universal_life')
                      ),
  face_amount         numeric(12,2),
  premium             numeric(10,2),
  premium_mode        text check (premium_mode in ('monthly', 'quarterly', 'semi_annual', 'annual')),
  application_number  text,
  policy_number       text,
  status              text not null default 'pending' check (
                        status in ('pending', 'issued', 'declined', 'withdrawn', 'lapsed', 'cancelled')
                      ),
  effective_date      date,
  issue_date          date,
  writing_agent       uuid references public.users(id) on delete set null,
  commission_amount   numeric(10,2),
  commission_rate     numeric(5,4),
  renewal_schedule    jsonb not null default '[]',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index policies_user_id_idx on public.policies(user_id);
create index policies_contact_id_idx on public.policies(contact_id);
create index policies_carrier_id_idx on public.policies(carrier_id);
create index policies_status_idx on public.policies(status);
create index policies_policy_number_idx on public.policies(policy_number);

create trigger policies_set_updated_at
  before update on public.policies
  for each row execute function public.set_updated_at();

alter table public.policies enable row level security;

create policy "policies_select_own"
  on public.policies for select
  using (auth.uid() = user_id);

create policy "policies_insert_own"
  on public.policies for insert
  with check (auth.uid() = user_id);

create policy "policies_update_own"
  on public.policies for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "policies_delete_own"
  on public.policies for delete
  using (auth.uid() = user_id);

-- Link commissions to policies now that policies exist as a first-class table.
alter table public.commissions
  add column if not exists policy_id uuid references public.policies(id) on delete set null;

create index if not exists commissions_policy_id_idx on public.commissions(policy_id);
