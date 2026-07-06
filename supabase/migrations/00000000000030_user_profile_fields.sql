-- ── Extended user profile fields ──────────────────────────────────────────────
-- Adds the columns that the Settings page persists. All fields are optional
-- so existing rows are unaffected.

alter table public.users
  add column if not exists license_number            text,
  add column if not exists bio                       text,
  add column if not exists default_state             text,
  add column if not exists agency_phone              text,
  add column if not exists agency_email              text,
  add column if not exists agency_website            text,
  add column if not exists agency_tax_id             text,
  add column if not exists agency_address            text,
  add column if not exists agency_city               text,
  add column if not exists agency_state              text,
  add column if not exists notification_preferences  jsonb not null default '{}'::jsonb;
