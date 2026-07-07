-- Rescale call_scores rows where overall_score looks like a 0-10 value (≤ 10).
-- These were stored before the normalization fix in post-call/route.ts.
-- Multiply overall_score by 10, and multiply every numeric value in the scores
-- and quality_scores jsonb columns by 10 as well.

update public.call_scores
set
  overall_score = least(100, overall_score * 10),
  scores = (
    select jsonb_object_agg(
      key,
      case
        when jsonb_typeof(value) = 'number'
          then to_jsonb(least(100, (value::text)::numeric * 10))
        else value
      end
    )
    from jsonb_each(scores)
  ),
  quality_scores = (
    select jsonb_object_agg(
      key,
      case
        when jsonb_typeof(value) = 'number'
          then to_jsonb(least(100, (value::text)::numeric * 10))
        else value
      end
    )
    from jsonb_each(quality_scores)
  )
where overall_score between 1 and 10;
