-- ============================================================================
-- palmi: circle classification (Phase 1.1)
-- Migration 017: structured circle profile so the curator can adapt and the
-- discovery agent (Phase 2) has something to match against.
-- ============================================================================
--
-- Design:
--   - One circle_profile row per circle (1:1, FK + PK is circle_id).
--   - Classification can be 'ai', 'owner', or 'hybrid'. Owner override pins
--     it via circles.purpose_locked = true so the AI doesn't overwrite.
--   - Embedding column lives in 018 (pgvector), so this migration applies
--     even on Postgres environments where pgvector is not yet enabled.
--   - llm_calls gains a metadata jsonb column so curator/classifier calls
--     can record the prompt variant or other small breadcrumbs without
--     having to add a new column for every agent.
-- ============================================================================

-- Owner override flag on circles ----------------------------------------------
alter table public.circles
  add column if not exists purpose_locked boolean not null default false;

-- Lightweight metadata bag on llm_calls (variant id, fallback reason, etc.) ---
alter table public.llm_calls
  add column if not exists metadata jsonb;

-- Circle profile --------------------------------------------------------------
-- purpose:  high-level category, drives curator variant selection
-- audience: who's primarily in the circle (campus, professional, mixed, ...)
-- subtopics:    free-form classifier output (e.g., {biology, mcat-prep})
-- vibe_keywords: tone hints surfaced to the curator (e.g., {accountability})
-- summary:  ≤280 chars, AI-written, reused as discovery blurb seed in Phase 2
-- classified_by: 'ai' (auto), 'owner' (manual override), 'hybrid' (mix)

create table if not exists public.circle_profile (
  circle_id        uuid primary key references public.circles(id) on delete cascade,
  purpose          text not null default 'friends'
                     check (purpose in (
                       'friends',
                       'study',
                       'professional',
                       'interest',
                       'wellness',
                       'creator',
                       'local',
                       'other'
                     )),
  audience         text not null default 'mixed'
                     check (audience in ('campus', 'young_adult', 'professional', 'mixed')),
  subtopics        text[] not null default '{}',
  vibe_keywords    text[] not null default '{}',
  summary          text check (summary is null or char_length(summary) <= 280),
  classified_at    timestamptz,
  classified_by    text not null default 'ai'
                     check (classified_by in ('ai', 'owner', 'hybrid')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists circle_profile_purpose_idx on public.circle_profile(purpose);
create index if not exists circle_profile_audience_idx on public.circle_profile(audience);
create index if not exists circle_profile_subtopics_gin on public.circle_profile using gin (subtopics);

-- Auto-update updated_at on every write
create or replace function public.touch_circle_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists circle_profile_touch on public.circle_profile;
create trigger circle_profile_touch
  before update on public.circle_profile
  for each row execute function public.touch_circle_profile();

-- RLS -------------------------------------------------------------------------
-- Members of a circle may read its profile (they already see the circle row).
-- Owners can update purpose / subtopics via dedicated UI; service role does
-- everything else. No public access ever.
alter table public.circle_profile enable row level security;

create policy "circle_profile_member_read"
  on public.circle_profile for select
  using (public.is_circle_member(circle_id));

create policy "circle_profile_owner_update"
  on public.circle_profile for update
  using (
    exists (
      select 1 from public.memberships
      where memberships.circle_id = circle_profile.circle_id
        and memberships.user_id = auth.uid()
        and memberships.role = 'owner'
        and memberships.left_at is null
    )
  )
  with check (
    exists (
      select 1 from public.memberships
      where memberships.circle_id = circle_profile.circle_id
        and memberships.user_id = auth.uid()
        and memberships.role = 'owner'
        and memberships.left_at is null
    )
  );

-- No insert/delete policies for end users. Only service role inserts/deletes.

comment on table public.circle_profile is
  'Phase 1: AI-generated structured purpose for each circle. Drives adaptive '
  'curator prompts and (in Phase 2) the intent-based discovery matcher.';
