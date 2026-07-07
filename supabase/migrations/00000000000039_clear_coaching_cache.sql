-- Clear all coaching_cache rows so the next page load regenerates plans
-- using the corrected score data from migration 38.
truncate public.coaching_cache;
