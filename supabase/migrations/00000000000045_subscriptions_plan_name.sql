-- Add plan_name and canceled_at columns referenced by the billing webhook/status routes
alter table public.subscriptions
  add column if not exists plan_name text,
  add column if not exists canceled_at timestamptz;
