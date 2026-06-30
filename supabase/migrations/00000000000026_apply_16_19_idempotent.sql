-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent re-application of migrations 16–19 only.
-- Safe to run even if some objects from this range already partially exist —
-- every CREATE is guarded (IF NOT EXISTS, or DROP ... IF EXISTS + CREATE for
-- objects that don't support IF NOT EXISTS natively: policies, triggers).
-- Does NOT touch users/contacts(base)/leads(base)/appointments/calls/
-- call_scores/reports/commissions(base)/tasks/documents/knowledge_base/
-- templates/settings — those already exist and are left alone (only
-- additive ALTER TABLE ... ADD COLUMN IF NOT EXISTS touches contacts/leads/
-- commissions below).
--
-- After this runs successfully, 00000000000025_apply_21_24_idempotent.sql
-- can be run without modification.
-- ─────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 16: contacts/leads field extensions + clients view
-- ════════════════════════════════════════════════════════════════════════════

alter table public.contacts
  add column if not exists middle_name           text,
  add column if not exists gender                text check (gender in ('male', 'female', 'other', 'unspecified')),
  add column if not exists secondary_phone        text,
  add column if not exists county                 text,
  add column if not exists marital_status         text check (marital_status in ('single', 'married', 'divorced', 'widowed', 'unspecified')),
  add column if not exists occupation             text,
  add column if not exists beneficiary_name        text,
  add column if not exists beneficiary_relationship text,
  add column if not exists medicare               boolean,
  add column if not exists tobacco                boolean,
  add column if not exists prescription_notes      text,
  add column if not exists current_carrier         text,
  add column if not exists agent_notes             text;

create index if not exists contacts_county_idx on public.contacts(county);

create or replace view public.clients as
  select * from public.contacts where status = 'client';

alter view public.clients set (security_invoker = true);

alter table public.leads
  add column if not exists lead_vendor       text,
  add column if not exists cost              numeric(10,2),
  add column if not exists lead_type         text check (lead_type in ('fresh', 'aged', 'internet', 'direct_mail', 'referral', 'other')),
  add column if not exists purchased_date    date,
  add column if not exists lead_score        int check (lead_score between 0 and 100),
  add column if not exists last_contact_at   timestamptz,
  add column if not exists disposition       text,
  add column if not exists attempts          int not null default 0,
  add column if not exists appointment_date  timestamptz,
  add column if not exists policy_sold       boolean not null default false,
  add column if not exists close_probability int check (close_probability between 0 and 100);

create index if not exists leads_lead_type_idx on public.leads(lead_type);
create index if not exists leads_purchased_date_idx on public.leads(purchased_date);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 17: carriers
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.carriers (
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

create index if not exists carriers_user_id_idx on public.carriers(user_id);

drop trigger if exists carriers_set_updated_at on public.carriers;
create trigger carriers_set_updated_at
  before update on public.carriers
  for each row execute function public.set_updated_at();

alter table public.carriers enable row level security;

drop policy if exists "carriers_select_own" on public.carriers;
create policy "carriers_select_own"
  on public.carriers for select
  using (auth.uid() = user_id);

drop policy if exists "carriers_insert_own" on public.carriers;
create policy "carriers_insert_own"
  on public.carriers for insert
  with check (auth.uid() = user_id);

drop policy if exists "carriers_update_own" on public.carriers;
create policy "carriers_update_own"
  on public.carriers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "carriers_delete_own" on public.carriers;
create policy "carriers_delete_own"
  on public.carriers for delete
  using (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 18: policies
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.policies (
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

create index if not exists policies_user_id_idx on public.policies(user_id);
create index if not exists policies_contact_id_idx on public.policies(contact_id);
create index if not exists policies_carrier_id_idx on public.policies(carrier_id);
create index if not exists policies_status_idx on public.policies(status);
create index if not exists policies_policy_number_idx on public.policies(policy_number);

drop trigger if exists policies_set_updated_at on public.policies;
create trigger policies_set_updated_at
  before update on public.policies
  for each row execute function public.set_updated_at();

alter table public.policies enable row level security;

drop policy if exists "policies_select_own" on public.policies;
create policy "policies_select_own"
  on public.policies for select
  using (auth.uid() = user_id);

drop policy if exists "policies_insert_own" on public.policies;
create policy "policies_insert_own"
  on public.policies for insert
  with check (auth.uid() = user_id);

drop policy if exists "policies_update_own" on public.policies;
create policy "policies_update_own"
  on public.policies for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "policies_delete_own" on public.policies;
create policy "policies_delete_own"
  on public.policies for delete
  using (auth.uid() = user_id);

alter table public.commissions
  add column if not exists policy_id uuid references public.policies(id) on delete set null;

create index if not exists commissions_policy_id_idx on public.commissions(policy_id);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 19: audit_logs, notifications, activity_feed
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}',
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_user_id_idx on public.audit_logs(user_id);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_select_own" on public.audit_logs;
create policy "audit_logs_select_own"
  on public.audit_logs for select
  using (auth.uid() = user_id);

drop policy if exists "audit_logs_insert_own" on public.audit_logs;
create policy "audit_logs_insert_own"
  on public.audit_logs for insert
  with check (auth.uid() = user_id);

-- No update/delete policies: audit logs are append-only for regular users.

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null check (
                type in ('task_due', 'appointment_reminder', 'lead_assigned', 'commission_paid', 'system', 'policy_status_change')
              ),
  title       text not null,
  body        text,
  link        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_unread_idx on public.notifications(user_id, read) where read = false;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own"
  on public.notifications for insert
  with check (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  using (auth.uid() = user_id);

create table if not exists public.activity_feed (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null check (
                type in ('lead', 'client', 'policy', 'appointment', 'commission', 'task', 'call')
              ),
  entity_id   uuid,
  text        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists activity_feed_user_id_idx on public.activity_feed(user_id, created_at desc);

alter table public.activity_feed enable row level security;

drop policy if exists "activity_feed_select_own" on public.activity_feed;
create policy "activity_feed_select_own"
  on public.activity_feed for select
  using (auth.uid() = user_id);

drop policy if exists "activity_feed_insert_own" on public.activity_feed;
create policy "activity_feed_insert_own"
  on public.activity_feed for insert
  with check (auth.uid() = user_id);

drop policy if exists "activity_feed_delete_own" on public.activity_feed;
create policy "activity_feed_delete_own"
  on public.activity_feed for delete
  using (auth.uid() = user_id);
