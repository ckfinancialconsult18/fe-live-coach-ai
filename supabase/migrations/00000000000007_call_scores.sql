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
