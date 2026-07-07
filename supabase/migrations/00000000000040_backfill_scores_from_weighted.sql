-- Backfill the scores jsonb column from the weightedBreakdown stored in report_details.
-- The AI's `scores` field was unreliable (many zeros); weightedBreakdown.categories
-- contains the correct per-stage scores derived from categoryScores.

update public.call_scores cs
set scores = cs.scores || (
  select jsonb_object_agg(cat->>'key', (cat->>'score')::int)
  from jsonb_array_elements(cs.report_details->'weightedBreakdown'->'categories') as cat
  where (cat->>'score') is not null
)
where cs.report_details->'weightedBreakdown'->'categories' is not null
  and jsonb_array_length(cs.report_details->'weightedBreakdown'->'categories') > 0;
