-- Adaptive Coaching Weights
-- Tracks which knowledge sources drive successful calls and reweights retrieval.

-- ─── Retrieval log ────────────────────────────────────────────────────────────
-- One row per chunk retrieved per coaching turn.
-- call_id links this to the post-call outcome so we know if it helped.
create table if not exists public.knowledge_retrieval_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  call_id         uuid references public.calls(id) on delete set null,
  chunk_id        uuid,
  document_id     uuid references public.knowledge_documents(id) on delete cascade,
  knowledge_base_id uuid references public.knowledge_base(id) on delete cascade,
  similarity      float  not null,
  coaching_context text,
  created_at      timestamptz not null default now()
);

create index if not exists krl_user_idx     on public.knowledge_retrieval_log(user_id);
create index if not exists krl_call_idx     on public.knowledge_retrieval_log(call_id) where call_id is not null;
create index if not exists krl_doc_idx      on public.knowledge_retrieval_log(document_id) where document_id is not null;
create index if not exists krl_created_idx  on public.knowledge_retrieval_log(user_id, created_at desc);

alter table public.knowledge_retrieval_log enable row level security;
create policy "Users manage own retrieval logs"
  on public.knowledge_retrieval_log for all using (auth.uid() = user_id);

-- ─── Document stats + adaptive weight ────────────────────────────────────────
-- One row per document per user.
-- weight is recomputed every time positive_outcome_count changes.
create table if not exists public.knowledge_document_stats (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  document_id           uuid references public.knowledge_documents(id) on delete cascade,
  knowledge_base_id     uuid references public.knowledge_base(id) on delete cascade,
  retrieval_count       int  not null default 0,
  positive_outcome_count int not null default 0,
  -- weight: 1.0 = neutral, >1 = promoted, <1 = demoted. Range [0.5, 2.0].
  -- Stays 1.0 until >= 3 retrievals (avoids early noise).
  weight                float not null default 1.0,
  last_retrieved_at     timestamptz,
  updated_at            timestamptz not null default now()
);

-- Partial unique indexes — each user can have at most one stats row per document
create unique index if not exists kds_user_doc_unique
  on public.knowledge_document_stats(user_id, document_id)
  where document_id is not null;

create unique index if not exists kds_user_kb_unique
  on public.knowledge_document_stats(user_id, knowledge_base_id)
  where knowledge_base_id is not null;

create index if not exists kds_user_weight_idx
  on public.knowledge_document_stats(user_id, weight desc);

alter table public.knowledge_document_stats enable row level security;
create policy "Users manage own document stats"
  on public.knowledge_document_stats for all using (auth.uid() = user_id);

-- ─── increment_knowledge_retrieval ───────────────────────────────────────────
-- Called (fire-and-forget) after every RAG retrieval during live coaching.
-- Atomically bumps retrieval_count; no weight change here.
create or replace function public.increment_knowledge_retrieval(
  p_user_id         uuid,
  p_document_id     uuid default null,
  p_knowledge_base_id uuid default null
) returns void language plpgsql security definer as $$
begin
  if p_document_id is not null then
    insert into public.knowledge_document_stats
      (user_id, document_id, retrieval_count, last_retrieved_at, updated_at)
    values (p_user_id, p_document_id, 1, now(), now())
    on conflict (user_id, document_id) where document_id is not null
    do update set
      retrieval_count    = knowledge_document_stats.retrieval_count + 1,
      last_retrieved_at  = now(),
      updated_at         = now();
  elsif p_knowledge_base_id is not null then
    insert into public.knowledge_document_stats
      (user_id, knowledge_base_id, retrieval_count, last_retrieved_at, updated_at)
    values (p_user_id, p_knowledge_base_id, 1, now(), now())
    on conflict (user_id, knowledge_base_id) where knowledge_base_id is not null
    do update set
      retrieval_count    = knowledge_document_stats.retrieval_count + 1,
      last_retrieved_at  = now(),
      updated_at         = now();
  end if;
end;
$$;

-- ─── record_knowledge_positive_outcome ───────────────────────────────────────
-- Called when a call that used this knowledge ends with a policy written.
-- Increments positive_outcome_count and recomputes weight:
--   weight = clamp(0.5, 2.0, 0.6 + 1.4 * win_rate)  [if retrieval_count >= 3]
--   weight = 1.0                                       [if < 3 retrievals — avoid noise]
create or replace function public.record_knowledge_positive_outcome(
  p_user_id     uuid,
  p_document_id uuid
) returns void language plpgsql security definer as $$
declare
  v_ret  int;
  v_pos  int;
  v_wt   float;
begin
  insert into public.knowledge_document_stats
    (user_id, document_id, retrieval_count, positive_outcome_count, updated_at)
  values (p_user_id, p_document_id, 1, 1, now())
  on conflict (user_id, document_id) where document_id is not null
  do update set
    positive_outcome_count = knowledge_document_stats.positive_outcome_count + 1,
    updated_at             = now()
  returning retrieval_count, positive_outcome_count into v_ret, v_pos;

  -- Compute weight after update
  if v_ret is null then
    select retrieval_count, positive_outcome_count
      into v_ret, v_pos
      from public.knowledge_document_stats
     where user_id = p_user_id and document_id = p_document_id;
  end if;

  if v_ret >= 3 then
    v_wt := least(2.0, greatest(0.5, 0.6 + 1.4 * (v_pos::float / v_ret)));
  else
    v_wt := 1.0;
  end if;

  update public.knowledge_document_stats
     set weight = v_wt, updated_at = now()
   where user_id = p_user_id and document_id = p_document_id;
end;
$$;
