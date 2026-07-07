-- ─────────────────────────────────────────────────────────────────────────────
-- agencies — one row per agency; the owner is the user who created it
-- ─────────────────────────────────────────────────────────────────────────────

create table public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id)  -- one agency per owner for now
);

create trigger agencies_set_updated_at
  before update on public.agencies
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- agency_members — which users belong to which agency (owner included)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.agency_members (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null default 'agent' check (role in ('owner', 'agent')),
  joined_at   timestamptz not null default now(),
  unique (agency_id, user_id)
);

create index agency_members_agency_idx on public.agency_members(agency_id);
create index agency_members_user_idx   on public.agency_members(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- agency_invites — pending invite links; redeemed via token
-- ─────────────────────────────────────────────────────────────────────────────

create table public.agency_invites (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  token       uuid not null default gen_random_uuid() unique,
  invited_by  uuid not null references public.users(id) on delete cascade,
  email       text,                       -- optional: pre-fill for a specific person
  used_by     uuid references public.users(id) on delete set null,
  used_at     timestamptz,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
alter table public.agency_invites enable row level security;

-- Agencies: owner can do everything; members can read
create policy "agencies_owner_all"
  on public.agencies for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "agencies_member_select"
  on public.agencies for select
  using (
    exists (
      select 1 from public.agency_members
      where agency_id = agencies.id and user_id = auth.uid()
    )
  );

-- Agency members: owner can manage; members can read own row
create policy "agency_members_owner_all"
  on public.agency_members for all
  using (
    exists (
      select 1 from public.agencies
      where id = agency_members.agency_id and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.agencies
      where id = agency_members.agency_id and owner_id = auth.uid()
    )
  );

create policy "agency_members_self_select"
  on public.agency_members for select
  using (user_id = auth.uid());

-- Invites: owner can create/read; anyone can read a specific invite by token (for joining)
create policy "agency_invites_owner_all"
  on public.agency_invites for all
  using (
    exists (
      select 1 from public.agencies
      where id = agency_invites.agency_id and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.agencies
      where id = agency_invites.agency_id and owner_id = auth.uid()
    )
  );

-- Any authenticated user can read an invite (needed to validate token on join page)
create policy "agency_invites_read_by_token"
  on public.agency_invites for select
  using (auth.uid() is not null);

-- Any member can update the invite to mark it used (join action)
create policy "agency_invites_update_used"
  on public.agency_invites for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
