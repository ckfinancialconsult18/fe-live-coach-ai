-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions & shared helpers used by every later migration
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- Generic "touch updated_at" trigger function, reused by every table below.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
-- ─────────────────────────────────────────────────────────────────────────────
-- users — profile row for every authenticated agent (extends auth.users)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  avatar_url    text,
  role          text not null default 'agent' check (role in ('admin', 'agent', 'viewer')),
  phone         text,
  agency_name   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Auto-create a public.users row whenever someone signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.users enable row level security;

create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Profile rows are only ever created by the handle_new_user trigger
-- (security definer), so no insert/delete policy is granted to clients.
-- ─────────────────────────────────────────────────────────────────────────────
-- contacts — unified address book (leads, clients, and everyone in between)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  email         text,
  phone         text,
  age           int,
  dob           date,
  address       text,
  city          text,
  state         text,
  zip           text,
  status        text not null default 'lead' check (status in ('lead', 'client', 'inactive')),
  source        text,
  tags          text[] not null default '{}',
  notes         text,
  existing_coverage text,
  medical_notes text,
  last_call_at  timestamptz,
  score         int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index contacts_user_id_idx on public.contacts(user_id);
create index contacts_status_idx on public.contacts(status);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.contacts enable row level security;

create policy "contacts_select_own"
  on public.contacts for select
  using (auth.uid() = user_id);

create policy "contacts_insert_own"
  on public.contacts for insert
  with check (auth.uid() = user_id);

create policy "contacts_update_own"
  on public.contacts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "contacts_delete_own"
  on public.contacts for delete
  using (auth.uid() = user_id);
-- ─────────────────────────────────────────────────────────────────────────────
-- leads — sales pipeline (separate from contacts so the funnel can be tracked
-- independently of an already-converted client)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  first_name    text not null,
  last_name     text not null,
  email         text,
  phone         text,
  status        text not null default 'new' check (
                  status in ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost')
                ),
  source        text,
  tags          text[] not null default '{}',
  notes         text,
  assigned_to   uuid references public.users(id) on delete set null,
  age           int,
  state         text,
  city          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index leads_user_id_idx on public.leads(user_id);
create index leads_status_idx on public.leads(status);
create index leads_contact_id_idx on public.leads(contact_id);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.leads enable row level security;

create policy "leads_select_own"
  on public.leads for select
  using (auth.uid() = user_id);

create policy "leads_insert_own"
  on public.leads for insert
  with check (auth.uid() = user_id);

create policy "leads_update_own"
  on public.leads for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "leads_delete_own"
  on public.leads for delete
  using (auth.uid() = user_id);
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
-- ─────────────────────────────────────────────────────────────────────────────
-- calls — every live/practice call: transcript, underwriting capture, metrics
-- ─────────────────────────────────────────────────────────────────────────────

create table public.calls (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  contact_id        uuid references public.contacts(id) on delete set null,
  lead_id           uuid references public.leads(id) on delete set null,
  call_type         text not null default 'sales' check (call_type in ('sales', 'coaching', 'role_play')),
  outcome           text check (outcome in ('policy_written', 'follow_up', 'not_interested', 'no_answer')),
  duration_seconds  int not null default 0,
  transcript        jsonb not null default '[]'::jsonb,
  underwriting      jsonb not null default '{}'::jsonb,
  metrics           jsonb not null default '{}'::jsonb,
  recording_path    text,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index calls_user_id_idx on public.calls(user_id);
create index calls_contact_id_idx on public.calls(contact_id);
create index calls_started_at_idx on public.calls(started_at desc);

create trigger calls_set_updated_at
  before update on public.calls
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.calls enable row level security;

create policy "calls_select_own"
  on public.calls for select
  using (auth.uid() = user_id);

create policy "calls_insert_own"
  on public.calls for insert
  with check (auth.uid() = user_id);

create policy "calls_update_own"
  on public.calls for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "calls_delete_own"
  on public.calls for delete
  using (auth.uid() = user_id);
-- ─────────────────────────────────────────────────────────────────────────────
-- call_scores — post-call AI report, one row per call
-- ─────────────────────────────────────────────────────────────────────────────

create table public.call_scores (
  id                    uuid primary key default gen_random_uuid(),
  call_id               uuid not null references public.calls(id) on delete cascade,
  user_id               uuid not null references public.users(id) on delete cascade,
  overall_score         int not null check (overall_score between 0 and 100),
  scores                jsonb not null default '{}'::jsonb,
  strengths             text[] not null default '{}',
  missed_opportunities  text[] not null default '{}',
  buying_signals        text[] not null default '{}',
  objections            text[] not null default '{}',
  summary               text,
  follow_up_text        text,
  follow_up_email       text,
  crm_notes             text,
  improvement_plan      text,
  created_at            timestamptz not null default now(),

  unique (call_id)
);

create index call_scores_user_id_idx on public.call_scores(user_id);
create index call_scores_call_id_idx on public.call_scores(call_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.call_scores enable row level security;

create policy "call_scores_select_own"
  on public.call_scores for select
  using (auth.uid() = user_id);

create policy "call_scores_insert_own"
  on public.call_scores for insert
  with check (auth.uid() = user_id);

create policy "call_scores_update_own"
  on public.call_scores for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "call_scores_delete_own"
  on public.call_scores for delete
  using (auth.uid() = user_id);
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
-- ─────────────────────────────────────────────────────────────────────────────
-- documents — metadata for files stored in the `documents` storage bucket
-- ─────────────────────────────────────────────────────────────────────────────

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  name          text not null,
  category      text not null default 'other' check (
                  category in ('application', 'policy', 'id', 'medical', 'beneficiary', 'other')
                ),
  storage_path  text not null,
  file_size     bigint,
  mime_type     text,
  created_at    timestamptz not null default now()
);

create index documents_user_id_idx on public.documents(user_id);
create index documents_contact_id_idx on public.documents(contact_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.documents enable row level security;

create policy "documents_select_own"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "documents_insert_own"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "documents_update_own"
  on public.documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "documents_delete_own"
  on public.documents for delete
  using (auth.uid() = user_id);
-- ─────────────────────────────────────────────────────────────────────────────
-- knowledge_base — extracted coaching knowledge (objections, medications,
-- closing techniques, etc.), replacing the old file-based pipeline store.
-- Entries start 'pending' and move to 'approved' / 'rejected' via review.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.knowledge_base (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  source_call_id    uuid references public.calls(id) on delete set null,
  job_id            text,
  type              text not null check (type in (
                      'objection', 'rebuttal_successful', 'rebuttal_failed', 'buying_signal',
                      'emotional_trigger', 'medication', 'diagnosis', 'underwriting', 'carrier',
                      'compliance', 'closing_technique', 'successful_close', 'failed_close',
                      'discovery_question', 'sales_psychology', 'personality', 'financial_concern',
                      'family_dynamic', 'funeral_concern', 'coaching_opportunity', 'agent_mistake',
                      'agent_strength', 'memorable_phrase'
                    )),
  target_file       text not null check (target_file in (
                      'objection_handbook', 'carrier_rules', 'underwriting', 'medications',
                      'winning_calls', 'losing_calls', 'sales_psychology', 'coaching_rules',
                      'buying_signals', 'closing_scripts', 'personality_profiles', 'discovery_questions'
                    )),
  section           text,
  summary           text not null,
  content           text not null,
  evidence          text,
  markdown_entry    text,
  confidence        int not null default 70 check (confidence between 0 and 100),
  tags              text[] not null default '{}',
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_duplicate      boolean not null default false,
  original_filename text,
  call_score        int,
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index knowledge_base_user_id_idx on public.knowledge_base(user_id);
create index knowledge_base_status_idx on public.knowledge_base(status);
create index knowledge_base_type_idx on public.knowledge_base(type);
create index knowledge_base_target_file_idx on public.knowledge_base(target_file);
create index knowledge_base_search_idx on public.knowledge_base
  using gin (to_tsvector('english', coalesce(summary, '') || ' ' || coalesce(content, '') || ' ' || coalesce(evidence, '')));

create trigger knowledge_base_set_updated_at
  before update on public.knowledge_base
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.knowledge_base enable row level security;

create policy "knowledge_base_select_own"
  on public.knowledge_base for select
  using (auth.uid() = user_id);

create policy "knowledge_base_insert_own"
  on public.knowledge_base for insert
  with check (auth.uid() = user_id);

create policy "knowledge_base_update_own"
  on public.knowledge_base for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "knowledge_base_delete_own"
  on public.knowledge_base for delete
  using (auth.uid() = user_id);
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
-- ─────────────────────────────────────────────────────────────────────────────
-- settings — one row per user, holds all settings-page tab data as jsonb
-- ─────────────────────────────────────────────────────────────────────────────

create table public.settings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references public.users(id) on delete cascade,
  profile         jsonb not null default '{}'::jsonb,
  agency          jsonb not null default '{}'::jsonb,
  notifications   jsonb not null default '{}'::jsonb,
  integrations    jsonb not null default '{}'::jsonb,
  billing         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.settings enable row level security;

create policy "settings_select_own"
  on public.settings for select
  using (auth.uid() = user_id);

create policy "settings_insert_own"
  on public.settings for insert
  with check (auth.uid() = user_id);

create policy "settings_update_own"
  on public.settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "settings_delete_own"
  on public.settings for delete
  using (auth.uid() = user_id);

-- Auto-create a blank settings row alongside every new user profile.
create or replace function public.handle_new_user_settings()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_public_user_created
  after insert on public.users
  for each row execute function public.handle_new_user_settings();
-- ─────────────────────────────────────────────────────────────────────────────
-- storage buckets — every file the app uploads lives in one of these.
-- Files are namespaced by uploader: <bucket>/<user_id>/<filename>
-- so the policies below can authorize using the first path segment.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('avatars',      'avatars',      true,  5242880),     -- 5 MB, public read
  ('documents',     'documents',    false, 26214400),   -- 25 MB, private
  ('recordings',    'recordings',   false, 524288000),  -- 500 MB, private
  ('transcripts',   'transcripts',  false, 26214400)    -- 25 MB, private (knowledge pipeline uploads)
on conflict (id) do nothing;

-- ── avatars: public read, owner write ───────────────────────────────────────
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_update"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── documents / recordings / transcripts: private, owner-only ──────────────
create policy "documents_owner_all"
  on storage.objects for all
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "recordings_owner_all"
  on storage.objects for all
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "transcripts_owner_all"
  on storage.objects for all
  using (bucket_id = 'transcripts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'transcripts' and (storage.foldername(name))[1] = auth.uid()::text);
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
-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs — immutable record of sensitive actions (who did what, when).
-- Insert-only from the app; no update/delete policies given to regular users.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.audit_logs (
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

create index audit_logs_user_id_idx on public.audit_logs(user_id);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

alter table public.audit_logs enable row level security;

create policy "audit_logs_select_own"
  on public.audit_logs for select
  using (auth.uid() = user_id);

create policy "audit_logs_insert_own"
  on public.audit_logs for insert
  with check (auth.uid() = user_id);

-- No update/delete policies: audit logs are append-only for regular users.

-- ─────────────────────────────────────────────────────────────────────────────
-- notifications — in-app notification feed per user.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.notifications (
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

create index notifications_user_id_idx on public.notifications(user_id);
create index notifications_unread_idx on public.notifications(user_id, read) where read = false;

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications_insert_own"
  on public.notifications for insert
  with check (auth.uid() = user_id);

create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notifications_delete_own"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- activity_feed — human-readable timeline of CRM events (separate from
-- audit_logs, which is the security-focused immutable log). This is what
-- powers "Recent activity" widgets.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.activity_feed (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null check (
                type in ('lead', 'client', 'policy', 'appointment', 'commission', 'task', 'call')
              ),
  entity_id   uuid,
  text        text not null,
  created_at  timestamptz not null default now()
);

create index activity_feed_user_id_idx on public.activity_feed(user_id, created_at desc);

alter table public.activity_feed enable row level security;

create policy "activity_feed_select_own"
  on public.activity_feed for select
  using (auth.uid() = user_id);

create policy "activity_feed_insert_own"
  on public.activity_feed for insert
  with check (auth.uid() = user_id);

create policy "activity_feed_delete_own"
  on public.activity_feed for delete
  using (auth.uid() = user_id);
-- ─────────────────────────────────────────────────────────────────────────────
-- Extend documents: carrier association, folders, tags, versioning, virus-scan
-- status placeholder, and full-text search.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.documents
  add column if not exists carrier_id      uuid references public.carriers(id) on delete set null,
  add column if not exists folder          text not null default 'general',
  add column if not exists tags            text[] not null default '{}',
  add column if not exists version         int not null default 1,
  add column if not exists scan_status     text not null default 'pending' check (scan_status in ('pending', 'clean', 'flagged', 'error')),
  add column if not exists original_filename text,
  add column if not exists updated_at      timestamptz not null default now();

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create index if not exists documents_carrier_id_idx on public.documents(carrier_id);
create index if not exists documents_folder_idx on public.documents(folder);
create index if not exists documents_scan_status_idx on public.documents(scan_status);

-- search_vector: plain column + trigger, not a GENERATED ALWAYS column.
-- to_tsvector('english', ...) cannot be used in a generated column because
-- the text->regconfig cast (even written explicitly as ::regconfig) is
-- STABLE, not IMMUTABLE, in Postgres — generated columns require a provably
-- immutable expression. This is the standard Postgres/Supabase-safe pattern.
alter table public.documents
  add column if not exists search_vector tsvector;

create or replace function public.documents_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := to_tsvector('english', coalesce(new.name, '') || ' ' || coalesce(array_to_string(new.tags, ' '), ''));
  return new;
end;
$$;

drop trigger if exists documents_search_vector_trigger on public.documents;
create trigger documents_search_vector_trigger
  before insert or update of name, tags on public.documents
  for each row execute function public.documents_search_vector_update();

update public.documents
set search_vector = to_tsvector('english', coalesce(name, '') || ' ' || coalesce(array_to_string(tags, ' '), ''))
where search_vector is null;

create index if not exists documents_search_idx on public.documents using gin(search_vector);

-- ─────────────────────────────────────────────────────────────────────────────
-- document_versions — append-only version history. A new upload to an
-- existing document inserts a row here and bumps documents.version, rather
-- than overwriting the storage object in place.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.document_versions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  version       int not null,
  storage_path  text not null,
  file_size     bigint,
  mime_type     text,
  created_at    timestamptz not null default now(),
  unique (document_id, version)
);

create index document_versions_document_id_idx on public.document_versions(document_id);

alter table public.document_versions enable row level security;

create policy "document_versions_select_own"
  on public.document_versions for select
  using (auth.uid() = user_id);

create policy "document_versions_insert_own"
  on public.document_versions for insert
  with check (auth.uid() = user_id);

create policy "document_versions_delete_own"
  on public.document_versions for delete
  using (auth.uid() = user_id);
-- ─────────────────────────────────────────────────────────────────────────────
-- Enable pgvector and build the RAG schema: source documents, chunks with
-- embeddings, a background embedding queue, category hierarchy, and search
-- analytics. This replaces the filesystem-backed knowledge pipeline
-- (lib/pipeline/*) as the system of record going forward.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists vector;

-- ── knowledge_categories — hierarchical grouping (e.g. "Carriers" > "Americo") ─
create table public.knowledge_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  parent_id   uuid references public.knowledge_categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, parent_id, name)
);

create index knowledge_categories_user_id_idx on public.knowledge_categories(user_id);
create index knowledge_categories_parent_id_idx on public.knowledge_categories(parent_id);

alter table public.knowledge_categories enable row level security;

create policy "knowledge_categories_select_own"
  on public.knowledge_categories for select using (auth.uid() = user_id);
create policy "knowledge_categories_insert_own"
  on public.knowledge_categories for insert with check (auth.uid() = user_id);
create policy "knowledge_categories_update_own"
  on public.knowledge_categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "knowledge_categories_delete_own"
  on public.knowledge_categories for delete using (auth.uid() = user_id);

-- ── knowledge_documents — reference source material (carrier guides, ────────
-- underwriting manuals, scripts, compliance rules, product docs, training) ──
create table public.knowledge_documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  category_id     uuid references public.knowledge_categories(id) on delete set null,
  carrier_id      uuid references public.carriers(id) on delete set null,
  title           text not null,
  source_type     text not null check (source_type in (
                    'carrier_guide', 'underwriting_manual', 'script', 'objection_handling',
                    'closing_technique', 'compliance', 'product_doc', 'training', 'other'
                  )),
  storage_path    text,
  mime_type       text,
  file_size       bigint,
  raw_text        text,
  status          text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  version         int not null default 1,
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index knowledge_documents_user_id_idx on public.knowledge_documents(user_id);
create index knowledge_documents_category_id_idx on public.knowledge_documents(category_id);
create index knowledge_documents_status_idx on public.knowledge_documents(status);
create index knowledge_documents_source_type_idx on public.knowledge_documents(source_type);

create trigger knowledge_documents_set_updated_at
  before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

alter table public.knowledge_documents enable row level security;

create policy "knowledge_documents_select_own"
  on public.knowledge_documents for select using (auth.uid() = user_id);
create policy "knowledge_documents_insert_own"
  on public.knowledge_documents for insert with check (auth.uid() = user_id);
create policy "knowledge_documents_update_own"
  on public.knowledge_documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "knowledge_documents_delete_own"
  on public.knowledge_documents for delete using (auth.uid() = user_id);

-- ── knowledge_chunks — chunked + embedded content. Polymorphic source: ──────
-- either a knowledge_documents row (reference material) or a knowledge_base
-- row (an extracted call insight), so both feed the same retrieval index. ──
create table public.knowledge_chunks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  document_id         uuid references public.knowledge_documents(id) on delete cascade,
  knowledge_base_id   uuid references public.knowledge_base(id) on delete cascade,
  chunk_index         int not null default 0,
  content             text not null,
  token_count         int,
  embedding           vector(1536),
  created_at          timestamptz not null default now(),
  check (
    (document_id is not null and knowledge_base_id is null) or
    (document_id is null and knowledge_base_id is not null)
  )
);

create index knowledge_chunks_user_id_idx on public.knowledge_chunks(user_id);
create index knowledge_chunks_document_id_idx on public.knowledge_chunks(document_id);
create index knowledge_chunks_knowledge_base_id_idx on public.knowledge_chunks(knowledge_base_id);

-- ivfflat approximate-nearest-neighbor index for cosine similarity search.
-- Requires ANALYZE after bulk inserts to build well; fine to create now since
-- ivfflat tolerates an empty table (it just won't be well-tuned until data
-- exists — `lists = 100` is a reasonable default for a single-tenant-per-row
-- table in the thousands-of-chunks range, revisit if it grows past ~1M rows).
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.knowledge_chunks enable row level security;

create policy "knowledge_chunks_select_own"
  on public.knowledge_chunks for select using (auth.uid() = user_id);
create policy "knowledge_chunks_insert_own"
  on public.knowledge_chunks for insert with check (auth.uid() = user_id);
create policy "knowledge_chunks_update_own"
  on public.knowledge_chunks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "knowledge_chunks_delete_own"
  on public.knowledge_chunks for delete using (auth.uid() = user_id);

-- ── embedding_queue — background processing queue. A row is enqueued on ────
-- document upload / knowledge_base insert; a worker (API route invoked by a
-- cron trigger — see note in app/api/knowledge/process-queue) claims pending
-- rows, chunks + embeds them, and writes knowledge_chunks. ──────────────────
create table public.embedding_queue (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  target_type   text not null check (target_type in ('knowledge_document', 'knowledge_base')),
  target_id     uuid not null,
  status        text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts      int not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index embedding_queue_status_idx on public.embedding_queue(status);
create index embedding_queue_user_id_idx on public.embedding_queue(user_id);

alter table public.embedding_queue enable row level security;

create policy "embedding_queue_select_own"
  on public.embedding_queue for select using (auth.uid() = user_id);
create policy "embedding_queue_insert_own"
  on public.embedding_queue for insert with check (auth.uid() = user_id);
create policy "embedding_queue_update_own"
  on public.embedding_queue for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "embedding_queue_delete_own"
  on public.embedding_queue for delete using (auth.uid() = user_id);

-- ── search_analytics — what agents search for and whether they found it ────
create table public.search_analytics (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  query             text not null,
  result_count      int not null default 0,
  clicked_chunk_id  uuid references public.knowledge_chunks(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index search_analytics_user_id_idx on public.search_analytics(user_id, created_at desc);

alter table public.search_analytics enable row level security;

create policy "search_analytics_select_own"
  on public.search_analytics for select using (auth.uid() = user_id);
create policy "search_analytics_insert_own"
  on public.search_analytics for insert with check (auth.uid() = user_id);

-- ── coaching_history — conversational memory for the Agent Performance ─────
-- Engine. Each row is a snapshot of the stats + recommendations generated at
-- a point in time, so future coaching calls can reference trends instead of
-- only the latest 30-day window. ────────────────────────────────────────────
create table public.coaching_history (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  stats             jsonb not null default '{}',
  recommendations   jsonb not null default '[]',
  created_at        timestamptz not null default now()
);

create index coaching_history_user_id_idx on public.coaching_history(user_id, created_at desc);

alter table public.coaching_history enable row level security;

create policy "coaching_history_select_own"
  on public.coaching_history for select using (auth.uid() = user_id);
create policy "coaching_history_insert_own"
  on public.coaching_history for insert with check (auth.uid() = user_id);

-- ── RPC for cosine-similarity retrieval, callable via supabase-js .rpc() ────
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 6,
  min_similarity float default 0.5
)
returns table (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  knowledge_base_id uuid
)
language sql stable
security invoker
as $$
  select
    kc.id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity,
    kc.document_id,
    kc.knowledge_base_id
  from public.knowledge_chunks kc
  where kc.user_id = match_user_id
    and kc.embedding is not null
    and 1 - (kc.embedding <=> query_embedding) >= min_similarity
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- ── knowledge storage bucket — raw uploaded reference documents ────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 26214400, array[
  'application/pdf', 'text/plain', 'text/markdown',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do nothing;

create policy "knowledge_storage_owner_all"
  on storage.objects for all
  using (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);
-- ─────────────────────────────────────────────────────────────────────────────
-- Duplicate detection: store a content hash per document upload and flag
-- exact duplicates for the same user at insert time (app-layer check uses
-- this index; see lib/documents/hash.ts + app/api/documents POST handler).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.documents
  add column if not exists file_hash text;

create index if not exists documents_user_hash_idx on public.documents(user_id, file_hash);
-- ─────────────────────────────────────────────────────────────────────────────
-- pipeline_logs — system-level processing telemetry, distinct from audit_logs
-- (which is the security/user-action trail). Tracks ingestion, embedding,
-- queue, and search-latency events for monitoring/debugging.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.pipeline_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete cascade,
  event_type    text not null check (event_type in (
                  'upload_failure', 'extraction_failure', 'embedding_failure',
                  'queue_failure', 'processing_complete', 'search_latency'
                )),
  target_type   text,
  target_id     uuid,
  duration_ms   int,
  message       text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index pipeline_logs_user_id_idx on public.pipeline_logs(user_id, created_at desc);
create index pipeline_logs_event_type_idx on public.pipeline_logs(event_type);

alter table public.pipeline_logs enable row level security;

create policy "pipeline_logs_select_own"
  on public.pipeline_logs for select using (auth.uid() = user_id);
create policy "pipeline_logs_insert_own"
  on public.pipeline_logs for insert with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Keyword search support on knowledge_documents (complements the semantic
-- pgvector search on knowledge_chunks) for hybrid ranking.
-- ─────────────────────────────────────────────────────────────────────────────

-- search_vector: plain column + trigger, not a GENERATED ALWAYS column —
-- see the matching note in migration 20 for why (to_tsvector's regconfig
-- cast is STABLE, not IMMUTABLE, so it can't be used in a generated column).
alter table public.knowledge_documents
  add column if not exists search_vector tsvector;

create or replace function public.knowledge_documents_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := to_tsvector(
    'english',
    coalesce(new.title, '') || ' ' || coalesce(new.raw_text, '') || ' ' || coalesce(array_to_string(new.tags, ' '), '')
  );
  return new;
end;
$$;

drop trigger if exists knowledge_documents_search_vector_trigger on public.knowledge_documents;
create trigger knowledge_documents_search_vector_trigger
  before insert or update of title, raw_text, tags on public.knowledge_documents
  for each row execute function public.knowledge_documents_search_vector_update();

update public.knowledge_documents
set search_vector = to_tsvector(
  'english',
  coalesce(title, '') || ' ' || coalesce(raw_text, '') || ' ' || coalesce(array_to_string(tags, ' '), '')
)
where search_vector is null;

create index if not exists knowledge_documents_search_idx on public.knowledge_documents using gin(search_vector);
-- ─────────────────────────────────────────────────────────────────────────────
-- knowledge_jobs — tracks call-transcript → insight-extraction processing
-- (the Knowledge Center "Upload" tab), replacing the filesystem job queue.
-- Distinct from embedding_queue (which handles chunk/embed for already-
-- approved knowledge + reference documents).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.knowledge_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  original_name       text not null,
  format              text not null,
  status              text not null default 'queued' check (status in (
                        'queued', 'parsing', 'extracting', 'deduplicating',
                        'pending_review', 'completed', 'failed'
                      )),
  progress            int not null default 0,
  error               text,
  retry_count         int not null default 0,
  word_count          int,
  extracted_count     int,
  new_knowledge_count int,
  call_type           text,
  call_outcome        text,
  call_score          int,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index knowledge_jobs_user_id_idx on public.knowledge_jobs(user_id, created_at desc);
create index knowledge_jobs_status_idx on public.knowledge_jobs(status);

alter table public.knowledge_jobs enable row level security;

create policy "knowledge_jobs_select_own"
  on public.knowledge_jobs for select using (auth.uid() = user_id);
create policy "knowledge_jobs_insert_own"
  on public.knowledge_jobs for insert with check (auth.uid() = user_id);
create policy "knowledge_jobs_update_own"
  on public.knowledge_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "knowledge_jobs_delete_own"
  on public.knowledge_jobs for delete using (auth.uid() = user_id);

-- Link knowledge_base entries back to the job that produced them (the column
-- already exists as text `job_id` from migration 12 — add a real FK-friendly
-- uuid column alongside it for joins, keeping job_id as a free-text label for
-- backward compat with any already-approved rows).
alter table public.knowledge_base
  add column if not exists knowledge_job_id uuid references public.knowledge_jobs(id) on delete set null;

create index if not exists knowledge_base_knowledge_job_id_idx on public.knowledge_base(knowledge_job_id);
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent re-application of migrations 21–24 only.
-- Safe to run even if some objects from this range already partially exist —
-- every CREATE is guarded (IF NOT EXISTS, or DROP ... IF EXISTS + CREATE for
-- objects that don't support IF NOT EXISTS natively: policies, triggers).
-- Does NOT touch users/contacts/leads/appointments/calls/call_scores/
-- reports/commissions/tasks/documents(base)/knowledge_base/templates/settings
-- — those already exist and are left alone.
--
-- NOTE on full-text search columns: `to_tsvector('english', ...)` cannot be
-- used in a GENERATED ALWAYS AS (...) STORED column. Even with an explicit
-- `::regconfig` cast, Postgres classifies the text->regconfig cast function
-- (regconfigin) as STABLE, not IMMUTABLE, because it depends on a catalog
-- lookup — and generated columns require a provably IMMUTABLE expression.
-- This is a hard PostgreSQL 17 / Supabase constraint, not a workaround-able
-- syntax issue. The fix used below: a plain (non-generated) tsvector column,
-- kept in sync by a BEFORE INSERT OR UPDATE trigger, plus a one-time backfill
-- for any existing rows. This is the standard production-safe pattern for
-- full-text search columns and is what Supabase's own docs recommend.
-- ─────────────────────────────────────────────────────────────────────────────

-- Fail fast with a clear message if carriers/policies (migrations 17-18)
-- haven't been applied yet — knowledge_documents and the re-applied
-- documents.carrier_id column below both have a foreign key to carriers.
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'carriers') then
    raise exception 'public.carriers does not exist. Run migrations 16-19 (clients_fields, carriers, policies, audit/notifications/activity) before this one.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 21: pgvector + knowledge RAG schema
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists vector;

-- ── knowledge_categories ────────────────────────────────────────────────────
create table if not exists public.knowledge_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  parent_id   uuid references public.knowledge_categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, parent_id, name)
);

create index if not exists knowledge_categories_user_id_idx on public.knowledge_categories(user_id);
create index if not exists knowledge_categories_parent_id_idx on public.knowledge_categories(parent_id);

alter table public.knowledge_categories enable row level security;

drop policy if exists "knowledge_categories_select_own" on public.knowledge_categories;
create policy "knowledge_categories_select_own"
  on public.knowledge_categories for select using (auth.uid() = user_id);

drop policy if exists "knowledge_categories_insert_own" on public.knowledge_categories;
create policy "knowledge_categories_insert_own"
  on public.knowledge_categories for insert with check (auth.uid() = user_id);

drop policy if exists "knowledge_categories_update_own" on public.knowledge_categories;
create policy "knowledge_categories_update_own"
  on public.knowledge_categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "knowledge_categories_delete_own" on public.knowledge_categories;
create policy "knowledge_categories_delete_own"
  on public.knowledge_categories for delete using (auth.uid() = user_id);

-- ── knowledge_documents ──────────────────────────────────────────────────────
-- Requires public.carriers to exist (FK). If migrations 16-18 were not
-- applied yet, this statement will fail with "relation carriers does not
-- exist" — run those first if so.
create table if not exists public.knowledge_documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  category_id     uuid references public.knowledge_categories(id) on delete set null,
  carrier_id      uuid references public.carriers(id) on delete set null,
  title           text not null,
  source_type     text not null check (source_type in (
                    'carrier_guide', 'underwriting_manual', 'script', 'objection_handling',
                    'closing_technique', 'compliance', 'product_doc', 'training', 'other'
                  )),
  storage_path    text,
  mime_type       text,
  file_size       bigint,
  raw_text        text,
  status          text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  version         int not null default 1,
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists knowledge_documents_user_id_idx on public.knowledge_documents(user_id);
create index if not exists knowledge_documents_category_id_idx on public.knowledge_documents(category_id);
create index if not exists knowledge_documents_status_idx on public.knowledge_documents(status);
create index if not exists knowledge_documents_source_type_idx on public.knowledge_documents(source_type);

drop trigger if exists knowledge_documents_set_updated_at on public.knowledge_documents;
create trigger knowledge_documents_set_updated_at
  before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

alter table public.knowledge_documents enable row level security;

drop policy if exists "knowledge_documents_select_own" on public.knowledge_documents;
create policy "knowledge_documents_select_own"
  on public.knowledge_documents for select using (auth.uid() = user_id);

drop policy if exists "knowledge_documents_insert_own" on public.knowledge_documents;
create policy "knowledge_documents_insert_own"
  on public.knowledge_documents for insert with check (auth.uid() = user_id);

drop policy if exists "knowledge_documents_update_own" on public.knowledge_documents;
create policy "knowledge_documents_update_own"
  on public.knowledge_documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "knowledge_documents_delete_own" on public.knowledge_documents;
create policy "knowledge_documents_delete_own"
  on public.knowledge_documents for delete using (auth.uid() = user_id);

-- ── knowledge_chunks ─────────────────────────────────────────────────────────
create table if not exists public.knowledge_chunks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  document_id         uuid references public.knowledge_documents(id) on delete cascade,
  knowledge_base_id   uuid references public.knowledge_base(id) on delete cascade,
  chunk_index         int not null default 0,
  content             text not null,
  token_count         int,
  embedding           vector(1536),
  created_at          timestamptz not null default now(),
  constraint knowledge_chunks_source_check check (
    (document_id is not null and knowledge_base_id is null) or
    (document_id is null and knowledge_base_id is not null)
  )
);

create index if not exists knowledge_chunks_user_id_idx on public.knowledge_chunks(user_id);
create index if not exists knowledge_chunks_document_id_idx on public.knowledge_chunks(document_id);
create index if not exists knowledge_chunks_knowledge_base_id_idx on public.knowledge_chunks(knowledge_base_id);
create index if not exists knowledge_chunks_embedding_idx on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.knowledge_chunks enable row level security;

drop policy if exists "knowledge_chunks_select_own" on public.knowledge_chunks;
create policy "knowledge_chunks_select_own"
  on public.knowledge_chunks for select using (auth.uid() = user_id);

drop policy if exists "knowledge_chunks_insert_own" on public.knowledge_chunks;
create policy "knowledge_chunks_insert_own"
  on public.knowledge_chunks for insert with check (auth.uid() = user_id);

drop policy if exists "knowledge_chunks_update_own" on public.knowledge_chunks;
create policy "knowledge_chunks_update_own"
  on public.knowledge_chunks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "knowledge_chunks_delete_own" on public.knowledge_chunks;
create policy "knowledge_chunks_delete_own"
  on public.knowledge_chunks for delete using (auth.uid() = user_id);

-- ── embedding_queue ──────────────────────────────────────────────────────────
create table if not exists public.embedding_queue (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  target_type   text not null check (target_type in ('knowledge_document', 'knowledge_base')),
  target_id     uuid not null,
  status        text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts      int not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index if not exists embedding_queue_status_idx on public.embedding_queue(status);
create index if not exists embedding_queue_user_id_idx on public.embedding_queue(user_id);

alter table public.embedding_queue enable row level security;

drop policy if exists "embedding_queue_select_own" on public.embedding_queue;
create policy "embedding_queue_select_own"
  on public.embedding_queue for select using (auth.uid() = user_id);

drop policy if exists "embedding_queue_insert_own" on public.embedding_queue;
create policy "embedding_queue_insert_own"
  on public.embedding_queue for insert with check (auth.uid() = user_id);

drop policy if exists "embedding_queue_update_own" on public.embedding_queue;
create policy "embedding_queue_update_own"
  on public.embedding_queue for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "embedding_queue_delete_own" on public.embedding_queue;
create policy "embedding_queue_delete_own"
  on public.embedding_queue for delete using (auth.uid() = user_id);

-- ── search_analytics ─────────────────────────────────────────────────────────
create table if not exists public.search_analytics (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  query             text not null,
  result_count      int not null default 0,
  clicked_chunk_id  uuid references public.knowledge_chunks(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists search_analytics_user_id_idx on public.search_analytics(user_id, created_at desc);

alter table public.search_analytics enable row level security;

drop policy if exists "search_analytics_select_own" on public.search_analytics;
create policy "search_analytics_select_own"
  on public.search_analytics for select using (auth.uid() = user_id);

drop policy if exists "search_analytics_insert_own" on public.search_analytics;
create policy "search_analytics_insert_own"
  on public.search_analytics for insert with check (auth.uid() = user_id);

-- ── coaching_history ─────────────────────────────────────────────────────────
create table if not exists public.coaching_history (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  stats             jsonb not null default '{}',
  recommendations   jsonb not null default '[]',
  created_at        timestamptz not null default now()
);

create index if not exists coaching_history_user_id_idx on public.coaching_history(user_id, created_at desc);

alter table public.coaching_history enable row level security;

drop policy if exists "coaching_history_select_own" on public.coaching_history;
create policy "coaching_history_select_own"
  on public.coaching_history for select using (auth.uid() = user_id);

drop policy if exists "coaching_history_insert_own" on public.coaching_history;
create policy "coaching_history_insert_own"
  on public.coaching_history for insert with check (auth.uid() = user_id);

-- ── match_knowledge_chunks RPC ───────────────────────────────────────────────
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 6,
  min_similarity float default 0.5
)
returns table (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  knowledge_base_id uuid
)
language sql stable
security invoker
as $$
  select
    kc.id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity,
    kc.document_id,
    kc.knowledge_base_id
  from public.knowledge_chunks kc
  where kc.user_id = match_user_id
    and kc.embedding is not null
    and 1 - (kc.embedding <=> query_embedding) >= min_similarity
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- ── knowledge storage bucket ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 26214400, array[
  'application/pdf', 'text/plain', 'text/markdown',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do nothing;

drop policy if exists "knowledge_storage_owner_all" on storage.objects;
create policy "knowledge_storage_owner_all"
  on storage.objects for all
  using (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 20 (included here too): document_versions did not exist per
-- your check, which means migration 20 likely never fully applied either.
-- Re-applying its contents idempotently so document_versions + the documents
-- column extensions it depends on are both present.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.documents
  add column if not exists carrier_id      uuid references public.carriers(id) on delete set null,
  add column if not exists folder          text not null default 'general',
  add column if not exists tags            text[] not null default '{}',
  add column if not exists version         int not null default 1,
  add column if not exists scan_status     text not null default 'pending' check (scan_status in ('pending', 'clean', 'flagged', 'error')),
  add column if not exists original_filename text,
  add column if not exists updated_at      timestamptz not null default now();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create index if not exists documents_carrier_id_idx on public.documents(carrier_id);
create index if not exists documents_folder_idx on public.documents(folder);
create index if not exists documents_scan_status_idx on public.documents(scan_status);

-- search_vector: plain column + trigger (see note at top of file for why this
-- replaces a GENERATED ALWAYS AS column).
alter table public.documents
  add column if not exists search_vector tsvector;

create or replace function public.documents_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := to_tsvector('english', coalesce(new.name, '') || ' ' || coalesce(array_to_string(new.tags, ' '), ''));
  return new;
end;
$$;

drop trigger if exists documents_search_vector_trigger on public.documents;
create trigger documents_search_vector_trigger
  before insert or update of name, tags on public.documents
  for each row execute function public.documents_search_vector_update();

-- Backfill any existing rows (and any inserted before the trigger existed).
update public.documents
set search_vector = to_tsvector('english', coalesce(name, '') || ' ' || coalesce(array_to_string(tags, ' '), ''))
where search_vector is null;

create index if not exists documents_search_idx on public.documents using gin(search_vector);

create table if not exists public.document_versions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  version       int not null,
  storage_path  text not null,
  file_size     bigint,
  mime_type     text,
  created_at    timestamptz not null default now(),
  unique (document_id, version)
);

create index if not exists document_versions_document_id_idx on public.document_versions(document_id);

alter table public.document_versions enable row level security;

drop policy if exists "document_versions_select_own" on public.document_versions;
create policy "document_versions_select_own"
  on public.document_versions for select
  using (auth.uid() = user_id);

drop policy if exists "document_versions_insert_own" on public.document_versions;
create policy "document_versions_insert_own"
  on public.document_versions for insert
  with check (auth.uid() = user_id);

drop policy if exists "document_versions_delete_own" on public.document_versions;
create policy "document_versions_delete_own"
  on public.document_versions for delete
  using (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 22: document duplicate detection
-- ════════════════════════════════════════════════════════════════════════════

alter table public.documents
  add column if not exists file_hash text;

create index if not exists documents_user_hash_idx on public.documents(user_id, file_hash);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 23: pipeline_logs + keyword search on knowledge_documents
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.pipeline_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete cascade,
  event_type    text not null check (event_type in (
                  'upload_failure', 'extraction_failure', 'embedding_failure',
                  'queue_failure', 'processing_complete', 'search_latency'
                )),
  target_type   text,
  target_id     uuid,
  duration_ms   int,
  message       text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists pipeline_logs_user_id_idx on public.pipeline_logs(user_id, created_at desc);
create index if not exists pipeline_logs_event_type_idx on public.pipeline_logs(event_type);

alter table public.pipeline_logs enable row level security;

drop policy if exists "pipeline_logs_select_own" on public.pipeline_logs;
create policy "pipeline_logs_select_own"
  on public.pipeline_logs for select using (auth.uid() = user_id);

drop policy if exists "pipeline_logs_insert_own" on public.pipeline_logs;
create policy "pipeline_logs_insert_own"
  on public.pipeline_logs for insert with check (auth.uid() = user_id);

-- search_vector: plain column + trigger (see note at top of file).
alter table public.knowledge_documents
  add column if not exists search_vector tsvector;

create or replace function public.knowledge_documents_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := to_tsvector(
    'english',
    coalesce(new.title, '') || ' ' || coalesce(new.raw_text, '') || ' ' || coalesce(array_to_string(new.tags, ' '), '')
  );
  return new;
end;
$$;

drop trigger if exists knowledge_documents_search_vector_trigger on public.knowledge_documents;
create trigger knowledge_documents_search_vector_trigger
  before insert or update of title, raw_text, tags on public.knowledge_documents
  for each row execute function public.knowledge_documents_search_vector_update();

update public.knowledge_documents
set search_vector = to_tsvector(
  'english',
  coalesce(title, '') || ' ' || coalesce(raw_text, '') || ' ' || coalesce(array_to_string(tags, ' '), '')
)
where search_vector is null;

create index if not exists knowledge_documents_search_idx on public.knowledge_documents using gin(search_vector);

-- ════════════════════════════════════════════════════════════════════════════
-- From migration 24: knowledge_jobs
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.knowledge_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  original_name       text not null,
  format              text not null,
  status              text not null default 'queued' check (status in (
                        'queued', 'parsing', 'extracting', 'deduplicating',
                        'pending_review', 'completed', 'failed'
                      )),
  progress            int not null default 0,
  error               text,
  retry_count         int not null default 0,
  word_count          int,
  extracted_count     int,
  new_knowledge_count int,
  call_type           text,
  call_outcome        text,
  call_score          int,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists knowledge_jobs_user_id_idx on public.knowledge_jobs(user_id, created_at desc);
create index if not exists knowledge_jobs_status_idx on public.knowledge_jobs(status);

alter table public.knowledge_jobs enable row level security;

drop policy if exists "knowledge_jobs_select_own" on public.knowledge_jobs;
create policy "knowledge_jobs_select_own"
  on public.knowledge_jobs for select using (auth.uid() = user_id);

drop policy if exists "knowledge_jobs_insert_own" on public.knowledge_jobs;
create policy "knowledge_jobs_insert_own"
  on public.knowledge_jobs for insert with check (auth.uid() = user_id);

drop policy if exists "knowledge_jobs_update_own" on public.knowledge_jobs;
create policy "knowledge_jobs_update_own"
  on public.knowledge_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "knowledge_jobs_delete_own" on public.knowledge_jobs;
create policy "knowledge_jobs_delete_own"
  on public.knowledge_jobs for delete using (auth.uid() = user_id);

alter table public.knowledge_base
  add column if not exists knowledge_job_id uuid references public.knowledge_jobs(id) on delete set null;

create index if not exists knowledge_base_knowledge_job_id_idx on public.knowledge_base(knowledge_job_id);
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
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3: autosave (mid-call resilience), call timeline, and the 12-dimension
-- AI Quality Score radar, on top of the existing calls/call_scores tables.
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── calls: autosave support ─────────────────────────────────────────────────
alter table public.calls
  add column if not exists status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  add column if not exists live_state jsonb not null default '{}'::jsonb;

create index if not exists calls_status_idx on public.calls(status);
-- Speeds up "find my in-progress call to resume" and dashboard "today's calls" queries.
create index if not exists calls_user_status_started_idx on public.calls(user_id, status, started_at desc);

-- ── call_scores: timeline + quality radar + extended report fields ─────────
alter table public.call_scores
  add column if not exists quality_scores jsonb not null default '{}'::jsonb,
  add column if not exists timeline jsonb not null default '[]'::jsonb,
  add column if not exists report_details jsonb not null default '{}'::jsonb;

-- ── Performance: composite indexes for common dashboard/report queries ──────
create index if not exists calls_user_started_idx on public.calls(user_id, started_at desc);
create index if not exists call_scores_overall_score_idx on public.call_scores(overall_score);
