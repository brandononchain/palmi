-- ============================================================================
-- palmi: discovery RPCs (Phase 2.4)
-- Migration 023: server-side helpers for the discover-circles function and
-- the request / approve / decline join flow.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- match_discoverable_circles
-- ---------------------------------------------------------------------------
-- Service-role only. Called from the discover-circles edge function after
-- it has produced a query embedding. Returns the top-N candidate circles by
-- cosine similarity, hard-filtered to discoverable + with-room + not-already-
-- a-member. The edge function then re-ranks the top set with an LLM rubric.
--
-- We never return circles the user is already in or has a pending request
-- against. Closed and invite_only circles are excluded by the discoverable
-- partial index.
-- ---------------------------------------------------------------------------
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
    1 - (cp.embedding <=> p_query_embedding) as similarity
  from public.circle_profile cp
  join public.circles c on c.id = cp.circle_id
  where c.discoverable    = true
    and c.deleted_at      is null
    and c.member_count    < 15
    and cp.embedding      is not null
    -- Exclude circles the user is already a member of
    and not exists (
      select 1 from public.memberships m
      where m.circle_id = c.id
        and m.user_id   = p_user_id
        and m.left_at   is null
    )
    -- Exclude circles the user has a pending request against
    and not exists (
      select 1 from public.circle_join_requests jr
      where jr.circle_id    = c.id
        and jr.requester_id = p_user_id
        and jr.status       = 'pending'
    )
  order by cp.embedding <=> p_query_embedding asc
  limit p_limit;
$$;

revoke all on function public.match_discoverable_circles(uuid, vector, int) from public;
grant execute on function public.match_discoverable_circles(uuid, vector, int) to service_role;


-- ---------------------------------------------------------------------------
-- request_join_circle
-- ---------------------------------------------------------------------------
-- Called by the requester from the find screen. Validates eligibility and
-- inserts a pending row. Returns the new request id.
--
-- Validations:
--   - Circle exists, not deleted, discoverable, admission_mode in
--     (request, open_screened).
--   - Requester is authenticated and not already a member.
--   - Requester has < 3 active circles (matches join_circle cap).
--   - No existing pending request from this user for this circle.
--   - intent_text is non-empty and ≤ 500 chars (also enforced by table check).
--
-- This RPC inserts the request as 'pending' with screening_recommendation
-- 'pending'. The screen-join-request edge function then runs out-of-band
-- (called by the find screen right after the RPC returns, or by a server
-- trigger in a future iteration) to set the recommendation.
-- ---------------------------------------------------------------------------
create or replace function public.request_join_circle(
  p_circle_id uuid,
  p_intent    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id           uuid := auth.uid();
  v_circle            record;
  v_already_member    boolean;
  v_active_circles    int;
  v_intent            text;
  v_request_id        uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  v_intent := btrim(coalesce(p_intent, ''));
  if v_intent = '' then
    raise exception 'intent is required';
  end if;
  if char_length(v_intent) > 500 then
    raise exception 'intent too long';
  end if;

  -- Pull circle with discovery context
  select id, discoverable, admission_mode, deleted_at, member_count
    into v_circle
  from public.circles
  where id = p_circle_id;

  if v_circle.id is null or v_circle.deleted_at is not null then
    raise exception 'circle not found';
  end if;
  if v_circle.discoverable = false then
    raise exception 'circle is not discoverable';
  end if;
  if v_circle.admission_mode not in ('request', 'open_screened') then
    raise exception 'circle does not accept requests';
  end if;
  if v_circle.member_count >= 15 then
    raise exception 'circle is full';
  end if;

  -- Already in?
  select exists (
    select 1 from public.memberships
    where circle_id = p_circle_id
      and user_id   = v_user_id
      and left_at   is null
  ) into v_already_member;
  if v_already_member then
    raise exception 'already a member';
  end if;

  -- Per-user circle cap (mirrors join_circle)
  select count(*) into v_active_circles
  from public.memberships
  where user_id = v_user_id and left_at is null;
  if v_active_circles >= 3 then
    raise exception 'circle limit reached (max 3)';
  end if;

  -- Existing pending request?
  if exists (
    select 1 from public.circle_join_requests
    where circle_id    = p_circle_id
      and requester_id = v_user_id
      and status       = 'pending'
  ) then
    raise exception 'request already pending';
  end if;

  insert into public.circle_join_requests
    (circle_id, requester_id, intent_text)
  values
    (p_circle_id, v_user_id, v_intent)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.request_join_circle(uuid, text) from public;
grant execute on function public.request_join_circle(uuid, text) to authenticated;


-- ---------------------------------------------------------------------------
-- approve_join_request
-- ---------------------------------------------------------------------------
-- Owner-only. Adds the requester as a member (respecting member cap) and
-- marks the request approved.
-- ---------------------------------------------------------------------------
create or replace function public.approve_join_request(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid := auth.uid();
  v_request        record;
  v_is_owner       boolean;
  v_active_circles int;
  v_already_member boolean;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request
  from public.circle_join_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'request already decided';
  end if;

  -- Caller must own the circle
  select exists (
    select 1 from public.memberships
    where circle_id = v_request.circle_id
      and user_id   = v_user_id
      and role      = 'owner'
      and left_at   is null
  ) into v_is_owner;

  if not v_is_owner then
    raise exception 'not authorized';
  end if;

  -- Caps still apply at approval time
  if (
    select member_count from public.circles where id = v_request.circle_id
  ) >= 15 then
    raise exception 'circle is full';
  end if;

  select count(*) into v_active_circles
  from public.memberships
  where user_id = v_request.requester_id and left_at is null;
  if v_active_circles >= 3 then
    raise exception 'requester is at circle limit';
  end if;

  -- Idempotency: handle the rare case where membership already snuck in.
  select exists (
    select 1 from public.memberships
    where circle_id = v_request.circle_id
      and user_id   = v_request.requester_id
      and left_at   is null
  ) into v_already_member;

  if not v_already_member then
    insert into public.memberships (circle_id, user_id, role)
    values (v_request.circle_id, v_request.requester_id, 'member');

    update public.circles
    set member_count = member_count + 1
    where id = v_request.circle_id;

    insert into public.notification_prefs (user_id, circle_id)
    values (v_request.requester_id, v_request.circle_id)
    on conflict (user_id, circle_id) do nothing;
  end if;

  update public.circle_join_requests
  set status      = 'approved',
      decided_by  = v_user_id,
      decided_at  = now()
  where id = p_request_id;

  return v_request.circle_id;
end;
$$;

revoke all on function public.approve_join_request(uuid) from public;
grant execute on function public.approve_join_request(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- decline_join_request
-- ---------------------------------------------------------------------------
-- Owner-only. Marks the request declined. Does not expose the requester to
-- circle data; declined rows are kept for audit.
-- ---------------------------------------------------------------------------
create or replace function public.decline_join_request(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_request  record;
  v_is_owner boolean;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request
  from public.circle_join_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'request already decided';
  end if;

  select exists (
    select 1 from public.memberships
    where circle_id = v_request.circle_id
      and user_id   = v_user_id
      and role      = 'owner'
      and left_at   is null
  ) into v_is_owner;
  if not v_is_owner then
    raise exception 'not authorized';
  end if;

  update public.circle_join_requests
  set status      = 'declined',
      decided_by  = v_user_id,
      decided_at  = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.decline_join_request(uuid) from public;
grant execute on function public.decline_join_request(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- set_join_request_screening
-- ---------------------------------------------------------------------------
-- Service-role only. Used by the screen-join-request edge function to write
-- back the AI screening result. For 'safe_auto_approve' on open_screened
-- circles, this also auto-approves and adds the membership.
-- ---------------------------------------------------------------------------
create or replace function public.set_join_request_screening(
  p_request_id  uuid,
  p_recommendation text,
  p_reason      text,
  p_auto_approve boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  if p_recommendation not in ('safe_auto_approve', 'needs_owner_review', 'reject') then
    raise exception 'invalid recommendation';
  end if;

  select * into v_request
  from public.circle_join_requests
  where id = p_request_id;
  if v_request.id is null then
    raise exception 'request not found';
  end if;

  update public.circle_join_requests
  set screening_recommendation = p_recommendation,
      screening_reason         = p_reason
  where id = p_request_id;

  if p_auto_approve and p_recommendation = 'safe_auto_approve'
     and v_request.status = 'pending'
  then
    -- Cap re-checks: skip auto-approve if circle filled up between request
    -- and screening, or requester hit their circle cap.
    if (select member_count from public.circles where id = v_request.circle_id) < 15
       and (
         select count(*) from public.memberships
         where user_id = v_request.requester_id and left_at is null
       ) < 3
    then
      insert into public.memberships (circle_id, user_id, role)
      values (v_request.circle_id, v_request.requester_id, 'member')
      on conflict (circle_id, user_id) do nothing;

      update public.circles
      set member_count = member_count + 1
      where id = v_request.circle_id
        and not exists (
          select 1 from public.memberships m
          where m.circle_id = v_request.circle_id
            and m.user_id   = v_request.requester_id
            and m.joined_at < now() - interval '1 second'
        );

      insert into public.notification_prefs (user_id, circle_id)
      values (v_request.requester_id, v_request.circle_id)
      on conflict (user_id, circle_id) do nothing;

      update public.circle_join_requests
      set status     = 'approved',
          decided_at = now()
      where id = p_request_id;
    end if;
  end if;
end;
$$;

revoke all on function public.set_join_request_screening(uuid, text, text, boolean) from public;
grant execute on function public.set_join_request_screening(uuid, text, text, boolean) to service_role;
