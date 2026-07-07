-- Fix infinite recursion in agency RLS policies.
-- The cycle: agencies policy → queries agency_members → agency_members policy → queries agencies → ∞
-- Solution: security definer helper that reads agencies without triggering RLS.

create or replace function public.get_agency_owner_id(p_agency_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select owner_id from public.agencies where id = p_agency_id;
$$;

-- Drop the recursive policies
drop policy if exists "agencies_member_select"    on public.agencies;
drop policy if exists "agency_members_owner_all"  on public.agency_members;

-- Recreate agencies member-select using the definer function (no cross-table RLS loop)
create policy "agencies_member_select"
  on public.agencies for select
  using (
    exists (
      select 1 from public.agency_members
      where agency_id = agencies.id and user_id = auth.uid()
    )
  );

-- Recreate agency_members owner policy using the definer function (breaks the cycle)
create policy "agency_members_owner_all"
  on public.agency_members for all
  using  (public.get_agency_owner_id(agency_id) = auth.uid())
  with check (public.get_agency_owner_id(agency_id) = auth.uid());
