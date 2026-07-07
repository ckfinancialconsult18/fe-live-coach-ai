-- ─────────────────────────────────────────────────────────────────────────────
-- Performance Engine Phase 2
-- 1. Expand agent_goals goal_type to support new goal categories
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old inline check constraint (auto-named by Postgres)
alter table public.agent_goals drop constraint if exists agent_goals_goal_type_check;

alter table public.agent_goals
  add constraint agent_goals_goal_type_check
  check (goal_type in (
    'calls_per_day',
    'appointments_per_day',
    'policies_per_day',
    'applications_submitted',
    'target_close_rate',
    'avg_call_score',
    'avg_discovery_score',
    'avg_rapport_score'
  ));
