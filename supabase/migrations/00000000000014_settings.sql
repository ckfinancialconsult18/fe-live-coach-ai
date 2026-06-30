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
