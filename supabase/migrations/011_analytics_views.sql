-- ============================================================================
-- palmi: Analytics views (aggregate-only, no per-user content tracking)
-- Migration 011
-- ============================================================================
-- Philosophy:
--   - Derived entirely from existing tables — NO new event logging.
--   - Content bodies (post/answer text, photos, questions) are NEVER selected.
--   - Views live in the `analytics` schema; only service_role has access.
--   - Small-N thresholds guard against de-anonymization in the 10-user phase.
-- ============================================================================

create schema if not exists analytics;

revoke all on schema analytics from public;
revoke all on schema analytics from anon, authenticated;
grant usage on schema analytics to service_role;


-- ── Active users ────────────────────────────────────────────────────────────
-- "Active" = took a meaningful action (post, answer, reaction). Viewing the
-- feed is NOT tracked and never will be.
create or replace view analytics.user_activity as
  select author_id as user_id, created_at from public.posts where deleted_at is null
  union all
  select author_id as user_id, created_at from public.question_answers where deleted_at is null
  union all
  select user_id, created_at from public.reactions;


-- DAU / WAU rolling 30 days (one row per day).
create or replace view analytics.daily_active_users as
  select
    date_trunc('day', created_at)::date as day,
    count(distinct user_id) as dau
  from analytics.user_activity
  where created_at >= now() - interval '30 days'
  group by 1
  order by 1 desc;

create or replace view analytics.weekly_active_users as
  select
    date_trunc('week', created_at)::date as week_start,
    count(distinct user_id) as wau
  from analytics.user_activity
  where created_at >= now() - interval '12 weeks'
  group by 1
  order by 1 desc;


-- ── Retention cohorts ──────────────────────────────────────────────────────
-- Signup-week cohorts, % of users active in each subsequent week.
-- Cohort size (n_users) shown so tiny cohorts are obvious.
create or replace view analytics.retention_cohorts as
with cohort as (
  select
    id as user_id,
    date_trunc('week', created_at)::date as cohort_week
  from public.profiles
),
activity_weeks as (
  select
    user_id,
    date_trunc('week', created_at)::date as active_week
  from analytics.user_activity
  group by 1, 2
)
select
  c.cohort_week,
  count(distinct c.user_id) as n_users,
  a.active_week,
  ((a.active_week - c.cohort_week) / 7)::int as week_offset,
  count(distinct a.user_id)::float / nullif(count(distinct c.user_id), 0) as retained_share
from cohort c
left join activity_weeks a on a.user_id = c.user_id and a.active_week >= c.cohort_week
group by c.cohort_week, a.active_week
order by c.cohort_week desc, a.active_week asc;


-- ── Posts per circle per week ──────────────────────────────────────────────
-- Per-circle counts are NOT exposed. Only overall median across circles.
create or replace view analytics.posts_per_circle_per_week as
with per_circle as (
  select
    circle_id,
    date_trunc('week', created_at)::date as week_start,
    count(*) as n_posts
  from public.posts
  where deleted_at is null
  group by 1, 2
)
select
  week_start,
  percentile_cont(0.5) within group (order by n_posts) as median_posts,
  percentile_cont(0.25) within group (order by n_posts) as p25_posts,
  percentile_cont(0.75) within group (order by n_posts) as p75_posts,
  count(*) as n_circles
from per_circle
where week_start >= now() - interval '12 weeks'
group by 1
having count(*) >= 3   -- require at least 3 circles for the median to be non-identifying
order by 1 desc;


-- ── Daily question engagement ──────────────────────────────────────────────
-- % of daily_questions that got ≥1 answer. Rolled up per week, no per-circle
-- breakdown.
create or replace view analytics.daily_question_answer_rate as
with q as (
  select
    dq.id,
    date_trunc('week', dq.drops_at)::date as week_start,
    exists (select 1 from public.question_answers qa
            where qa.question_id = dq.id and qa.deleted_at is null) as answered
  from public.daily_questions dq
  where dq.drops_at >= now() - interval '12 weeks'
)
select
  week_start,
  count(*) as n_questions,
  count(*) filter (where answered)::float / nullif(count(*), 0) as answer_rate
from q
group by 1
order by 1 desc;


-- ── Time-to-first-post after circle creation ───────────────────────────────
-- Only computed in aggregate over ALL circles with ≥5 members existing.
-- Returns a single row to prevent correlating with any specific circle.
create or replace view analytics.time_to_first_post as
with eligible as (
  select c.id, c.created_at
  from public.circles c
  where c.deleted_at is null
    and c.member_count >= 5
),
first_posts as (
  select
    e.id as circle_id,
    e.created_at as circle_created_at,
    min(p.created_at) as first_post_at
  from eligible e
  left join public.posts p on p.circle_id = e.id and p.deleted_at is null
  group by e.id, e.created_at
)
select
  count(*) filter (where first_post_at is not null) as n_circles_with_post,
  count(*) as n_eligible_circles,
  percentile_cont(0.5) within group (order by extract(epoch from (first_post_at - circle_created_at)) / 3600)
    filter (where first_post_at is not null) as median_hours_to_first_post,
  percentile_cont(0.9) within group (order by extract(epoch from (first_post_at - circle_created_at)) / 3600)
    filter (where first_post_at is not null) as p90_hours_to_first_post
from first_posts
having count(*) >= 5;   -- gate: view returns zero rows until we have 5+ eligible circles


-- ── Reaction usage by kind ─────────────────────────────────────────────────
-- Global counts per kind, last 30 days. No per-user, no per-circle.
create or replace view analytics.reactions_by_kind as
select
  kind,
  count(*) as n,
  count(*)::float / nullif(sum(count(*)) over (), 0) as share
from public.reactions
where created_at >= now() - interval '30 days'
group by kind
order by n desc;


-- ── Fallback question usage ────────────────────────────────────────────────
-- Which bank questions are most-used — guides what to add next. Safe: the
-- fallback bank is shared and not PII.
create or replace view analytics.top_fallback_questions as
select
  question_text,
  times_used,
  tags
from public.fallback_questions
where times_used > 0
order by times_used desc
limit 50;


-- ── View grants ────────────────────────────────────────────────────────────
-- Views are in the analytics schema (service_role-only by schema grant).
-- Belt-and-suspenders explicit grants below.
do $$
declare v record;
begin
  for v in select table_name from information_schema.views where table_schema = 'analytics'
  loop
    execute format('revoke all on analytics.%I from public, anon, authenticated', v.table_name);
    execute format('grant select on analytics.%I to service_role', v.table_name);
  end loop;
end$$;

comment on schema analytics is
  'Aggregate-only analytics views. No row-level user activity logged; no content bodies selected.';
