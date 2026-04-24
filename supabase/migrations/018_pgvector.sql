-- ============================================================================
-- palmi: pgvector + circle embedding (Phase 1.2)
-- Migration 018: enable pgvector and attach a 1536-dim embedding to
-- circle_profile so the discovery agent (Phase 2) can do cosine search.
-- ============================================================================
--
-- Embedding dimension matches OpenAI text-embedding-3-small (1536). If the
-- provider is changed later we add a new column rather than ALTER, since
-- ALTER on vector columns rebuilds indexes.
--
-- ivfflat needs ANALYZE-driven training. With < 1k circles we leave lists at
-- 100 (the pgvector default sweet spot for small corpora). Re-tune later.
-- ============================================================================

create extension if not exists "vector";

alter table public.circle_profile
  add column if not exists embedding vector(1536);

-- Cosine-similarity index. ivfflat is build-once / probe-cheap; good fit for
-- a corpus that grows slowly (circles, not posts).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname  = 'circle_profile_embedding_ivfflat'
  ) then
    execute
      'create index circle_profile_embedding_ivfflat '
      'on public.circle_profile using ivfflat (embedding vector_cosine_ops) '
      'with (lists = 100)';
  end if;
end$$;

comment on column public.circle_profile.embedding is
  'OpenAI text-embedding-3-small (1536 dims). Generated from circle summary + '
  'subtopics. Used by discover-circles edge function in Phase 2.';
