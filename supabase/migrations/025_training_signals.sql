-- ============================================================================
-- palmi: AI-Driven Circle Engine — enriched signals for agent training
-- Migration 025: daily engagement rollups, richer circle profile fields,
-- and an append-only AI training event log.
-- ============================================================================
--
-- Goals:
--   1. Give the classifier agent more than just "recent posts + names" to look
--      at. Reactions, reply graph, participation distribution, and response
--      cadence are all stronger signals of what a circle is actually about.
--   2. Produce a durable, privacy-aware dataset we can train / evaluate future
--      agents on without ever replaying raw PII. All aggregates are per-circle
--      counts + ratios + distribution buckets — no bodies, no names.
--   3. Keep every AI decision (classification, discovery match, join screening)
--      in one append-only log so we can measure drift and outcomes over time.
--
-- Privacy:
--   - circle_engagement_daily: counts / ratios only. No text, no user ids.
--   - circle_training_events: actor_id is intentionally nullable + optional.
--     Payloads are size-capped. RLS blocks all app access (service role only).
--   - v_circle_training_dataset: service-role-only view. Never granted to
--     authenticated.
-- ============================================================================

-- ─── Enriched columns on circle_profile ─────────────────────────────────────
-- engagement_stats: last snapshot of counts the classifier used. Helpful as
--   context for subsequent classifier calls (delta detection) and cheap to
--   read for the info screen.
-- health_score:     0.00–1.00, emitted by the classifier. Drives a subtle
--   badge in the owner UI ("circle is healthy" / "quiet lately").
-- activity_pattern: coarse bucket — which kind of rhythm the circle has.

alter table public.circle_profile
  add column if not exists engagement_stats jsonb,
  add column if not exists health_score     numeric(3, 2)
    check (health_score is null or (health_score >= 0 and health_score <= 1)),
  add column if not exists activity_pattern text
    check (activity_pattern is null or activity_pattern in (
      'dormant', 'sparse', 'steady', 'bursty', 'daily'
    )),
  add column if not exists last_activity_at timestamptz,
  add column if not exists signal_version   smallint not null default 1;

comment on column public.circle_profile.engagement_stats is
  'JSONB snapshot of the aggregate signals the classifier saw on last run. '
  'Shape: { members, active_members, posts, answers, reactions, replies, '
  'avg_response_seconds, participation_ratio, deleted_ratio, days_window }.';
comment on column public.circle_profile.health_score is
  '0.00–1.00. Emitted by classifier. Combines participation + cadence + signal.';
comment on column public.circle_profile.activity_pattern is
  'dormant | sparse | steady | bursty | daily — coarse rhythm bucket.';

-- ─── Daily engagement rollup (append-only, per-circle-per-day) ─────────────
create table if not exists public.circle_engagement_daily (
  circle_id              uuid not null references public.circles(id) on delete cascade,
  day                    date not null,
  -- Counts
  active_members         int  not null default 0,  -- distinct authors that day
  posts_count            int  not null default 0,
  answers_count          int  not null default 0,
  reactions_count        int  not null default 0,
  replies_count          int  not null default 0,
  mentions_count         int  not null default 0,
  deleted_count          int  not null default 0,
  -- Ratios / hints (nullable when denominator is 0)
  participation_ratio    numeric(3, 2),            -- active_members / total_members
  reaction_ratio         numeric(4, 2),            -- reactions / (posts + answers)
  -- Timing
  avg_response_seconds   int,                      -- mean answer latency vs question drop
  -- Top reaction kind for the day (heart | laugh | wow | support), nullable
  top_reaction_kind      text
    check (top_reaction_kind is null or top_reaction_kind in ('heart','laugh','wow','support')),
  recorded_at            timestamptz not null default now(),

  primary key (circle_id, day)
);

create index if not exists idx_engagement_daily_day
  on public.circle_engagement_daily (day desc);

alter table public.circle_engagement_daily enable row level security;

-- Owner may read rollups for their own circle (health dashboard).
create policy "engagement_daily_owner_read"
  on public.circle_engagement_daily for select
  using (
    exists (
      select 1 from public.memberships m
      where m.circle_id = circle_engagement_daily.circle_id
        and m.user_id   = auth.uid()
        and m.role      = 'owner'
        and m.left_at   is null
    )
  );
-- Inserts / updates: service role only (cron job).

comment on table public.circle_engagement_daily is
  'Append-only per-circle-per-day engagement rollup. Powers the AI classifier '
  'and future training datasets. Owners can read their own.';

-- ─── AI training event log (append-only) ──────────────────────────────────
-- A single durable log of every interesting AI moment. event_type expands as
-- we add agents. payload is bounded jsonb. No PII, no bodies — store aggregates
-- and small identifiers only.
create table if not exists public.circle_training_events (
  id          uuid primary key default uuid_generate_v4(),
  event_type  text not null
    check (event_type in (
      'classification_applied',
      'classification_changed',
      'discovery_matched',
      'discovery_miss',
      'join_request_screened',
      'join_request_decided',
      'recap_generated',
      'curator_adapted'
    )),
  circle_id   uuid references public.circles(id) on delete set null,
  actor_id    uuid references public.profiles(id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  -- Keep the payload size sane so the log doesn't bloat.
  constraint training_event_payload_size check (pg_column_size(payload) <= 8192)
);

create index if not exists idx_training_events_type_day
  on public.circle_training_events (event_type, created_at desc);
create index if not exists idx_training_events_circle
  on public.circle_training_events (circle_id, created_at desc)
  where circle_id is not null;

alter table public.circle_training_events enable row level security;
-- No policies = all app reads blocked. Service role bypasses RLS.

comment on table public.circle_training_events is
  'Append-only AI training event log. Service-role only. No PII in payload.';

-- ─── Daily rollup function ────────────────────────────────────────────────
-- Computes one row per active circle for a given day. Idempotent via upsert,
-- so the cron can safely run multiple times and backfills are a `select` away.
create or replace function public.compute_circle_engagement_daily(
  p_day date default (now() at time zone 'utc')::date - 1
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  with day_window as (
    select
      (p_day::timestamptz) as day_start,
      (p_day::timestamptz + interval '1 day') as day_end
  ),
  active_circles as (
    select distinct circle_id
    from public.posts, day_window
    where posts.created_at >= day_window.day_start
      and posts.created_at <  day_window.day_end
    union
    select distinct circle_id
    from public.question_answers, day_window
    where question_answers.created_at >= day_window.day_start
      and question_answers.created_at <  day_window.day_end
  ),
  member_counts as (
    select circle_id, count(*)::int as total_members
    from public.memberships
    where left_at is null
    group by circle_id
  ),
  post_stats as (
    select
      p.circle_id,
      count(*) filter (where p.deleted_at is null)::int as posts_count,
      count(*) filter (where p.deleted_at is not null)::int as deleted_count,
      count(*) filter (where p.reply_to_id is not null and p.deleted_at is null)::int as replies_count,
      count(distinct p.author_id) filter (where p.deleted_at is null)::int as active_authors_posts
    from public.posts p, day_window
    where p.created_at >= day_window.day_start
      and p.created_at <  day_window.day_end
    group by p.circle_id
  ),
  answer_stats as (
    select
      a.circle_id,
      count(*) filter (where a.deleted_at is null)::int as answers_count,
      count(distinct a.author_id) filter (where a.deleted_at is null)::int as active_authors_answers,
      -- avg seconds between question drop and answer
      avg(extract(epoch from (a.created_at - q.drops_at)))::int as avg_response_seconds
    from public.question_answers a
    join public.daily_questions q on q.id = a.question_id,
      day_window
    where a.created_at >= day_window.day_start
      and a.created_at <  day_window.day_end
      and a.deleted_at is null
    group by a.circle_id
  ),
  reaction_stats as (
    select
      p.circle_id,
      count(r.*)::int as reactions_count,
      (
        select rr.kind
        from public.reactions rr
        join public.posts pp on pp.id = rr.post_id
        where pp.circle_id = p.circle_id
          and rr.created_at >= (select day_start from day_window)
          and rr.created_at <  (select day_end   from day_window)
        group by rr.kind
        order by count(*) desc, rr.kind asc
        limit 1
      ) as top_reaction_kind
    from public.reactions r
    join public.posts p on p.id = r.post_id, day_window
    where r.created_at >= day_window.day_start
      and r.created_at <  day_window.day_end
    group by p.circle_id
  ),
  mention_stats as (
    select
      p.circle_id,
      count(*)::int as mentions_count
    from public.post_mentions m
    join public.posts p on p.id = m.post_id, day_window
    where m.created_at >= day_window.day_start
      and m.created_at <  day_window.day_end
    group by p.circle_id
  )
  insert into public.circle_engagement_daily as ced (
    circle_id, day,
    active_members, posts_count, answers_count, reactions_count,
    replies_count, mentions_count, deleted_count,
    participation_ratio, reaction_ratio,
    avg_response_seconds, top_reaction_kind
  )
  select
    c.circle_id,
    p_day,
    greatest(
      coalesce(ps.active_authors_posts,   0),
      coalesce(as2.active_authors_answers, 0)
    ) as active_members,
    coalesce(ps.posts_count,    0),
    coalesce(as2.answers_count, 0),
    coalesce(rs.reactions_count, 0),
    coalesce(ps.replies_count,   0),
    coalesce(ms.mentions_count,  0),
    coalesce(ps.deleted_count,   0),
    case when coalesce(mc.total_members, 0) > 0
         then round(
           greatest(
             coalesce(ps.active_authors_posts,   0),
             coalesce(as2.active_authors_answers, 0)
           )::numeric / mc.total_members::numeric,
           2
         )
         else null
    end as participation_ratio,
    case when coalesce(ps.posts_count, 0) + coalesce(as2.answers_count, 0) > 0
         then round(
           coalesce(rs.reactions_count, 0)::numeric
             / (coalesce(ps.posts_count, 0) + coalesce(as2.answers_count, 0))::numeric,
           2
         )
         else null
    end as reaction_ratio,
    as2.avg_response_seconds,
    rs.top_reaction_kind
  from active_circles c
  left join member_counts  mc  on mc.circle_id  = c.circle_id
  left join post_stats     ps  on ps.circle_id  = c.circle_id
  left join answer_stats   as2 on as2.circle_id = c.circle_id
  left join reaction_stats rs  on rs.circle_id  = c.circle_id
  left join mention_stats  ms  on ms.circle_id  = c.circle_id
  on conflict (circle_id, day) do update set
    active_members       = excluded.active_members,
    posts_count          = excluded.posts_count,
    answers_count        = excluded.answers_count,
    reactions_count      = excluded.reactions_count,
    replies_count        = excluded.replies_count,
    mentions_count       = excluded.mentions_count,
    deleted_count        = excluded.deleted_count,
    participation_ratio  = excluded.participation_ratio,
    reaction_ratio       = excluded.reaction_ratio,
    avg_response_seconds = excluded.avg_response_seconds,
    top_reaction_kind    = excluded.top_reaction_kind,
    recorded_at          = now();

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.compute_circle_engagement_daily(date) is
  'Computes / upserts circle_engagement_daily rows for the given UTC day. '
  'Defaults to yesterday. Idempotent. Called by cron; safe to re-run.';

-- ─── Nightly cron ─────────────────────────────────────────────────────────
-- Requires pg_cron (already enabled in migration 005). Runs at 00:15 UTC.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('palmi_engagement_daily');
    perform cron.schedule(
      'palmi_engagement_daily',
      '15 0 * * *',
      $cron$ select public.compute_circle_engagement_daily(); $cron$
    );
  end if;
exception when others then
  -- pg_cron is optional in local / CI. Skip silently.
  null;
end$$;

-- ─── Signals helper: classifier reads via this instead of 5 separate queries
-- Returns one aggregated JSON object per circle for the last N days.
create or replace function public.get_circle_signals(
  p_circle_id uuid,
  p_days int default 14
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := now() - make_interval(days => p_days);
  v_members  int;
  v_active   int;
  v_posts    int;
  v_answers  int;
  v_reactions int;
  v_replies  int;
  v_mentions int;
  v_deleted  int;
  v_avg_resp int;
  v_top_kind text;
begin
  select count(*) into v_members
    from public.memberships
    where circle_id = p_circle_id and left_at is null;

  -- active members = distinct authors across posts + answers in window
  select count(*) into v_active
    from (
      select author_id from public.posts
        where circle_id = p_circle_id
          and created_at >= v_window_start
          and deleted_at is null
      union
      select author_id from public.question_answers
        where circle_id = p_circle_id
          and created_at >= v_window_start
          and deleted_at is null
    ) src;

  select
    count(*) filter (where deleted_at is null),
    count(*) filter (where reply_to_id is not null and deleted_at is null),
    count(*) filter (where deleted_at is not null)
  into v_posts, v_replies, v_deleted
  from public.posts
  where circle_id = p_circle_id and created_at >= v_window_start;

  select
    count(*) filter (where deleted_at is null),
    avg(extract(epoch from (a.created_at - q.drops_at)))::int
  into v_answers, v_avg_resp
  from public.question_answers a
  join public.daily_questions q on q.id = a.question_id
  where a.circle_id = p_circle_id and a.created_at >= v_window_start;

  select count(r.*) into v_reactions
  from public.reactions r
  join public.posts p on p.id = r.post_id
  where p.circle_id = p_circle_id and r.created_at >= v_window_start;

  select count(m.*) into v_mentions
  from public.post_mentions m
  join public.posts p on p.id = m.post_id
  where p.circle_id = p_circle_id and m.created_at >= v_window_start;

  select r.kind into v_top_kind
  from public.reactions r
  join public.posts p on p.id = r.post_id
  where p.circle_id = p_circle_id and r.created_at >= v_window_start
  group by r.kind
  order by count(*) desc, r.kind asc
  limit 1;

  return jsonb_build_object(
    'days_window',        p_days,
    'members',            coalesce(v_members, 0),
    'active_members',     coalesce(v_active, 0),
    'posts',              coalesce(v_posts, 0),
    'answers',            coalesce(v_answers, 0),
    'reactions',          coalesce(v_reactions, 0),
    'replies',            coalesce(v_replies, 0),
    'mentions',           coalesce(v_mentions, 0),
    'deleted',            coalesce(v_deleted, 0),
    'avg_response_seconds', v_avg_resp,
    'top_reaction_kind',  v_top_kind,
    'participation_ratio',
      case when coalesce(v_members, 0) > 0
           then round(coalesce(v_active, 0)::numeric / v_members::numeric, 2)
           else null
      end,
    'reaction_ratio',
      case when coalesce(v_posts, 0) + coalesce(v_answers, 0) > 0
           then round(
             coalesce(v_reactions, 0)::numeric
               / (coalesce(v_posts, 0) + coalesce(v_answers, 0))::numeric,
             2
           )
           else null
      end,
    'signal_count', coalesce(v_posts, 0) + coalesce(v_answers, 0)
  );
end;
$$;

comment on function public.get_circle_signals(uuid, int) is
  'Returns a compact JSONB of aggregated circle signals for the classifier. '
  'Service-role callable; no PII.';

-- ─── Training dataset view (service-role only) ────────────────────────────
-- Joins the current classification with last-7 engagement rollup. Intended
-- for offline training pipelines. Never grant to authenticated.
create or replace view public.v_circle_training_dataset as
select
  cp.circle_id,
  cp.purpose,
  cp.audience,
  cp.subtopics,
  cp.vibe_keywords,
  cp.health_score,
  cp.activity_pattern,
  cp.signal_version,
  cp.engagement_stats,
  cp.classified_at,
  cp.classified_by,
  (
    select jsonb_agg(
      jsonb_build_object(
        'day',                  ced.day,
        'active_members',       ced.active_members,
        'posts',                ced.posts_count,
        'answers',              ced.answers_count,
        'reactions',            ced.reactions_count,
        'replies',              ced.replies_count,
        'mentions',             ced.mentions_count,
        'deleted',              ced.deleted_count,
        'participation_ratio',  ced.participation_ratio,
        'reaction_ratio',       ced.reaction_ratio,
        'avg_response_seconds', ced.avg_response_seconds,
        'top_reaction_kind',    ced.top_reaction_kind
      )
      order by ced.day desc
    )
    from public.circle_engagement_daily ced
    where ced.circle_id = cp.circle_id
      and ced.day >= (now() at time zone 'utc')::date - 30
  ) as engagement_last_30d
from public.circle_profile cp;

revoke all on public.v_circle_training_dataset from public, authenticated, anon;

comment on view public.v_circle_training_dataset is
  'Service-role-only training dataset. Joins current circle_profile with the '
  'last 30 days of engagement rollups. Never expose to clients.';
