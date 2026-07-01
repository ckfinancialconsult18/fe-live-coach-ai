-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 28: Fix call persistence.
--
-- Migration 27 (phase3_autosave_quality_timeline) added required columns to
-- calls and call_scores. If that migration was never applied to the database,
-- every /api/calls/start and /api/post-call insert fails because the `status`
-- column doesn't exist, silently losing all call data.
--
-- This migration is fully idempotent — safe to run even if migration 27 was
-- already applied. It also fixes the improvement_plan column type (was text,
-- must be jsonb so the API can store the array the coach model returns).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── calls: status + live_state ───────────────────────────────────────────────
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  ADD COLUMN IF NOT EXISTS live_state jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS calls_status_idx
  ON public.calls(status);
CREATE INDEX IF NOT EXISTS calls_user_status_started_idx
  ON public.calls(user_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS calls_user_started_idx
  ON public.calls(user_id, started_at DESC);

-- ── call_scores: phase-3 report columns ─────────────────────────────────────
ALTER TABLE public.call_scores
  ADD COLUMN IF NOT EXISTS quality_scores  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS timeline        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS report_details  jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── call_scores: fix improvement_plan (text → jsonb) ────────────────────────
-- The original migration 7 typed this column as text; the API sends an array.
-- Convert to jsonb so the upsert succeeds.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'call_scores'
      AND column_name  = 'improvement_plan'
      AND data_type    = 'text'
  ) THEN
    ALTER TABLE public.call_scores
      ALTER COLUMN improvement_plan TYPE jsonb
      USING COALESCE(NULLIF(improvement_plan, '')::jsonb, '[]'::jsonb);
  END IF;
END $$;

-- Add the column with the correct type if it was never created at all.
ALTER TABLE public.call_scores
  ADD COLUMN IF NOT EXISTS improvement_plan jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── Performance: compound index for dashboard "recent calls" query ───────────
CREATE INDEX IF NOT EXISTS call_scores_overall_score_idx
  ON public.call_scores(overall_score);
