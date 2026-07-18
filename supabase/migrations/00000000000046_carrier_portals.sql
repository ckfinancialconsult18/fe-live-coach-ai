-- carrier_portals — per-agent portal credentials stored as JSONB on the users table.
-- Shape: { "Carrier Name": { portal_url: "https://...", portal_username: "agent@email.com" }, ... }
-- Usernames are stored for UI pre-fill convenience only (not passwords).

alter table public.users
  add column if not exists carrier_portals jsonb not null default '{}';
