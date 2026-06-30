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
