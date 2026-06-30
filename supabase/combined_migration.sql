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
