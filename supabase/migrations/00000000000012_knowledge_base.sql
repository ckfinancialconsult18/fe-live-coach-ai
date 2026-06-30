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
