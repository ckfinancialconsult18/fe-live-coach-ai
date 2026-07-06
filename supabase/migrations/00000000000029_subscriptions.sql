-- ── Stripe subscriptions ──────────────────────────────────────────────────────
-- Stores one row per user. Written only by the Stripe webhook handler via the
-- service-role client (RLS blocks all user writes). Users may read their own row.

create table if not exists public.subscriptions (
  id                    uuid         primary key default gen_random_uuid(),
  user_id               uuid         not null references public.users(id) on delete cascade,
  stripe_customer_id    text         unique,
  stripe_subscription_id text        unique,
  -- trialing | active | past_due | canceled | unpaid | none
  status                text         not null default 'none',
  price_id              text,
  trial_ends_at         timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean      not null default false,
  created_at            timestamptz  not null default now(),
  updated_at            timestamptz  not null default now(),
  constraint subscriptions_user_id_key unique (user_id)
);

alter table public.subscriptions enable row level security;

create policy "Users can read their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Only service-role (webhook) may insert/update — no user-facing write policies.

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();
