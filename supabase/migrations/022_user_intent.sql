-- ============================================================================
-- palmi: user intent log (Phase 2.2)
-- Migration 022: durable record of every discovery query for personalization
-- and for measuring matcher quality over time.
-- ============================================================================
--
-- One row per discover-circles invocation. Self-only RLS — never exposed in
-- aggregate to other users. parsed_intent is whatever the orchestrator
-- agent extracted from the raw query (purpose, subtopics, audience hints,
-- constraints). embedding is the query embedding, reused if the same user
-- searches again to skip an embeddings call.
-- ============================================================================

create table if not exists public.user_intent_log (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  query_text      text not null check (char_length(query_text) between 1 and 500),
  parsed_intent   jsonb,
  embedding       vector(1536),
  result_count    int  not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_user_intent_log_user
  on public.user_intent_log (user_id, created_at desc);

-- ivfflat index on embedding for "find similar past queries" (used in Phase 3
-- to recommend circles based on what cohort searches converge on). Cheap to
-- have now since the table starts empty.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_user_intent_log_embedding'
  ) then
    execute 'create index idx_user_intent_log_embedding on public.user_intent_log
      using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
  end if;
end$$;

-- RLS: self-only ------------------------------------------------------------
alter table public.user_intent_log enable row level security;

create policy "user_intent_self_read"
  on public.user_intent_log for select
  using (user_id = auth.uid());

-- Inserts go through the discover-circles edge function (service-role).
-- No app-side insert policy = direct client inserts blocked under RLS.

comment on table public.user_intent_log is
  'Phase 2.2: durable log of natural-language discovery queries. '
  'One row per discover-circles invocation. Self-only RLS.';
