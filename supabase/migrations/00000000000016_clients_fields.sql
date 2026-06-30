-- ─────────────────────────────────────────────────────────────────────────────
-- Extend contacts with full FE-agent client intake fields.
-- Design decision: contacts is the single source of truth for the address book
-- (status: lead/client/inactive). A separate `clients` table would duplicate
-- this data and require sync logic — instead we extend contacts and expose a
-- `clients` view for callers that only want status = 'client' rows.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- `source` already exists and doubles as "lead source"; `medical_notes` already
-- exists and covers "Health Notes"; `existing_coverage` already covers
-- "Existing Coverage". No need to duplicate those.

create index if not exists contacts_county_idx on public.contacts(county);

create or replace view public.clients as
  select * from public.contacts where status = 'client';

-- View inherits RLS from the underlying contacts table automatically in
-- Postgres (security_invoker is the default for views owned by the same
-- role), but make it explicit for clarity and to survive future changes.
alter view public.clients set (security_invoker = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend leads with FE-specific pipeline tracking fields.
-- ─────────────────────────────────────────────────────────────────────────────

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
