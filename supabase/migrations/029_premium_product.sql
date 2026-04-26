-- ============================================================================
-- palmi: premium product primitives + privacy-safe web funnel tracking
-- Migration 029
-- ============================================================================

-- memberships.role: add co_host ------------------------------------------------
alter table public.memberships
  drop constraint if exists memberships_role_check;

alter table public.memberships
  add constraint memberships_role_check
  check (role in ('member', 'co_host', 'owner'));

-- circles: premium product fields ---------------------------------------------
alter table public.circles
  add column if not exists theme_key text not null default 'paper'
    check (theme_key in ('paper', 'evening', 'forest', 'garden')),
  add column if not exists onboarding_note text
    check (onboarding_note is null or char_length(onboarding_note) between 1 and 280),
  add column if not exists pinned_post_id uuid references public.posts(id) on delete set null,
  add column if not exists discovery_priority int not null default 0
    check (discovery_priority between 0 and 100),
  add column if not exists recap_cadence text not null default 'monthly'
    check (recap_cadence in ('monthly', 'weekly'));

create index if not exists idx_circles_pinned_post on public.circles(pinned_post_id)
  where pinned_post_id is not null;

-- discovery matching override -------------------------------------------------
create or replace function public.match_discoverable_circles(
  p_user_id          uuid,
  p_query_embedding  vector(1536),
  p_limit            int default 20
)
returns table (
  circle_id         uuid,
  name              text,
  discovery_blurb   text,
  admission_mode    text,
  member_count      int,
  purpose           text,
  audience          text,
  subtopics         text[],
  vibe_keywords     text[],
  summary           text,
  similarity        float
)
language sql
stable
security definer
set search_path = public
as $$
  with requester as (
    select coalesce(subscription_tier, 'free') as subscription_tier
    from public.profiles
    where id = p_user_id
  )
  select
    c.id            as circle_id,
    c.name,
    c.discovery_blurb,
    c.admission_mode,
    c.member_count,
    cp.purpose,
    cp.audience,
    cp.subtopics,
    cp.vibe_keywords,
    cp.summary,
    (
      1 - (cp.embedding <=> p_query_embedding)
      + case
          when (select subscription_tier from requester) = 'premium_plus'
            then least(c.discovery_priority, 100) / 200.0
          when (select subscription_tier from requester) = 'premium'
            then least(c.discovery_priority, 100) / 400.0
          else 0
        end
    )::float as similarity
  from public.circle_profile cp
  join public.circles c on c.id = cp.circle_id
  where c.discoverable    = true
    and c.deleted_at      is null
    and c.member_count    < 15
    and cp.embedding      is not null
    and not exists (
      select 1 from public.memberships m
      where m.circle_id = c.id
        and m.user_id   = p_user_id
        and m.left_at   is null
    )
    and not exists (
      select 1 from public.circle_join_requests jr
      where jr.circle_id    = c.id
        and jr.requester_id = p_user_id
        and jr.status       = 'pending'
    )
  order by similarity desc
  limit p_limit;
$$;

grant execute on function public.match_discoverable_circles(uuid, vector, int) to service_role;

-- marketing funnel events -----------------------------------------------------
-- Privacy-safe acquisition measurement. No cookies, no user ids, no IPs.
create table if not exists public.marketing_funnel_events (
  id              uuid primary key default uuid_generate_v4(),
  event_name      text not null check (
    event_name in (
      'landing_view',
      'hero_cta_clicked',
      'waitlist_form_started',
      'waitlist_submitted',
      'pricing_view',
      'institutional_lead_submitted'
    )
  ),
  page_path       text not null,
  source          text,
  session_bucket  text not null,
  referrer_host   text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_marketing_funnel_events_created
  on public.marketing_funnel_events(created_at desc);

create index if not exists idx_marketing_funnel_events_name_created
  on public.marketing_funnel_events(event_name, created_at desc);

alter table public.marketing_funnel_events enable row level security;

drop policy if exists "marketing_funnel_insert_anon" on public.marketing_funnel_events;
create policy "marketing_funnel_insert_anon" on public.marketing_funnel_events
  for insert with check (true);

-- memory search ---------------------------------------------------------------
create or replace function public.search_my_memory(
  p_query text,
  p_limit int default 20
)
returns table (
  source_type text,
  source_id uuid,
  circle_id uuid,
  circle_name text,
  body text,
  created_at timestamptz,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('english', trim(coalesce(p_query, ''))) as tsq,
           greatest(1, least(coalesce(p_limit, 20), 50)) as lim,
           auth.uid() as uid
  ),
  post_hits as (
    select
      'post'::text as source_type,
      p.id as source_id,
      p.circle_id,
      c.name as circle_name,
      p.body,
      p.created_at,
      ts_rank_cd(to_tsvector('english', coalesce(p.body, '')), q.tsq) as rank
    from q
    join public.posts p on p.author_id = q.uid
    join public.circles c on c.id = p.circle_id
    where p.deleted_at is null
      and p.body is not null
      and q.tsq <> ''::tsquery
      and to_tsvector('english', p.body) @@ q.tsq
  ),
  answer_hits as (
    select
      'answer'::text as source_type,
      qa.id as source_id,
      qa.circle_id,
      c.name as circle_name,
      qa.body,
      qa.created_at,
      ts_rank_cd(to_tsvector('english', coalesce(qa.body, '')), q.tsq) as rank
    from q
    join public.question_answers qa on qa.author_id = q.uid
    join public.circles c on c.id = qa.circle_id
    where qa.deleted_at is null
      and qa.body is not null
      and q.tsq <> ''::tsquery
      and to_tsvector('english', qa.body) @@ q.tsq
  )
  select *
  from (
    select * from post_hits
    union all
    select * from answer_hits
  ) hits
  order by rank desc, created_at desc
  limit (select lim from q);
$$;

grant execute on function public.search_my_memory(text, int) to authenticated;

create or replace function public.get_yearbook_entries(
  p_year int default null
)
returns table (
  entry_type text,
  source_id uuid,
  circle_id uuid,
  circle_name text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with yr as (
    select coalesce(p_year, extract(year from now())::int) as y,
           auth.uid() as uid
  )
  select 'post'::text, p.id, p.circle_id, c.name, p.body, p.created_at
  from yr
  join public.posts p on p.author_id = yr.uid
  join public.circles c on c.id = p.circle_id
  where p.deleted_at is null
    and extract(year from p.created_at at time zone 'utc')::int = yr.y
  union all
  select 'answer'::text, qa.id, qa.circle_id, c.name, qa.body, qa.created_at
  from yr
  join public.question_answers qa on qa.author_id = yr.uid
  join public.circles c on c.id = qa.circle_id
  where qa.deleted_at is null
    and extract(year from qa.created_at at time zone 'utc')::int = yr.y
  order by created_at asc;
$$;

grant execute on function public.get_yearbook_entries(int) to authenticated;

-- circle management helpers ---------------------------------------------------
create or replace function public.update_circle_premium_settings(
  p_circle_id uuid,
  p_theme_key text default null,
  p_onboarding_note text default null,
  p_recap_cadence text default null,
  p_discovery_priority int default null
)
returns public.circles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_circle public.circles;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.memberships
    where circle_id = p_circle_id
      and user_id = v_user_id
      and role in ('owner', 'co_host')
      and left_at is null
  ) then
    raise exception 'not authorized';
  end if;

  update public.circles
  set theme_key = coalesce(p_theme_key, theme_key),
      onboarding_note = case when p_onboarding_note is null then onboarding_note else nullif(btrim(p_onboarding_note), '') end,
      recap_cadence = coalesce(p_recap_cadence, recap_cadence),
      discovery_priority = coalesce(p_discovery_priority, discovery_priority)
  where id = p_circle_id
  returning * into v_circle;

  return v_circle;
end;
$$;

grant execute on function public.update_circle_premium_settings(uuid, text, text, text, int) to authenticated;

create or replace function public.set_circle_member_role(
  p_circle_id uuid,
  p_member_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_count int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_role not in ('member', 'co_host') then
    raise exception 'invalid role';
  end if;

  if not exists (
    select 1 from public.memberships
    where circle_id = p_circle_id
      and user_id = v_user_id
      and role = 'owner'
      and left_at is null
  ) then
    raise exception 'not authorized';
  end if;

  if p_member_id = v_user_id then
    raise exception 'owner role cannot be changed here';
  end if;

  if p_role = 'co_host' then
    select count(*) into v_owner_count
    from public.memberships
    where circle_id = p_circle_id
      and role = 'co_host'
      and left_at is null;

    if v_owner_count >= 2 and not exists (
      select 1 from public.memberships
      where circle_id = p_circle_id
        and user_id = p_member_id
        and role = 'co_host'
        and left_at is null
    ) then
      raise exception 'co-host limit reached';
    end if;
  end if;

  update public.memberships
  set role = p_role
  where circle_id = p_circle_id
    and user_id = p_member_id
    and left_at is null;

  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

grant execute on function public.set_circle_member_role(uuid, uuid, text) to authenticated;

create or replace function public.pin_circle_post(
  p_circle_id uuid,
  p_post_id uuid
)
returns public.circles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_circle public.circles;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.memberships
    where circle_id = p_circle_id
      and user_id = v_user_id
      and role in ('owner', 'co_host')
      and left_at is null
  ) then
    raise exception 'not authorized';
  end if;

  if p_post_id is not null and not exists (
    select 1 from public.posts
    where id = p_post_id
      and circle_id = p_circle_id
      and deleted_at is null
  ) then
    raise exception 'post not found in circle';
  end if;

  update public.circles
  set pinned_post_id = p_post_id
  where id = p_circle_id
  returning * into v_circle;

  return v_circle;
end;
$$;

grant execute on function public.pin_circle_post(uuid, uuid) to authenticated;

create or replace function public.get_circle_participation_snapshot(
  p_circle_id uuid,
  p_days int default 28
)
returns table (
  active_members_avg numeric,
  posting_members_avg numeric,
  answer_rate_avg numeric,
  posts_total bigint,
  answers_total bigint,
  reactions_total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with permitted as (
    select 1
    from public.memberships
    where circle_id = p_circle_id
      and user_id = auth.uid()
      and role in ('owner', 'co_host')
      and left_at is null
  ),
  base as (
    select *
    from public.circle_engagement_daily
    where circle_id = p_circle_id
      and day >= current_date - greatest(1, least(coalesce(p_days, 28), 90))
  )
  select
    round(avg(active_members)::numeric, 2),
    round(avg(posting_members)::numeric, 2),
    round(avg(answer_rate)::numeric, 3),
    coalesce(sum(posts_count), 0),
    coalesce(sum(answers_count), 0),
    coalesce(sum(reactions_count), 0)
  from base
  where exists (select 1 from permitted);
$$;

grant execute on function public.get_circle_participation_snapshot(uuid, int) to authenticated;