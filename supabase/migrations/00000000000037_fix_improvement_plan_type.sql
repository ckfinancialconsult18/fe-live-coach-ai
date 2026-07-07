-- improvement_plan was declared as text but the app stores a text[].
-- Convert the column so analytics can use array operators correctly.
alter table public.call_scores
  alter column improvement_plan type text[]
  using case
    when improvement_plan is null then null
    -- already stored as Postgres array literal like {item1,item2} → cast directly
    else improvement_plan::text[]
  end;

-- also set a proper default
alter table public.call_scores
  alter column improvement_plan set default '{}';
