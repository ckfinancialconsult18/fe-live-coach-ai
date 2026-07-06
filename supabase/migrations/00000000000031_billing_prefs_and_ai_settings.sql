-- ── Billing: add plan_name and canceled_at to subscriptions ────────────────────
alter table public.subscriptions
  add column if not exists plan_name   text,        -- 'professional' | 'agency'
  add column if not exists canceled_at timestamptz; -- set when subscription is deleted

-- ── User settings: AI preferences and coaching preferences ──────────────────────
alter table public.users
  add column if not exists ai_preferences       jsonb not null default '{}'::jsonb,
  add column if not exists coaching_preferences jsonb not null default '{}'::jsonb;
