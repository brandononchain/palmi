-- ============================================================================
-- palmi: business logic RPCs
-- Migration 003: stored procedures clients call directly
-- ============================================================================
--
-- These are the only entry points for complex state changes. They enforce
-- invariants that RLS alone can't express (atomic multi-table operations,
-- generated invite codes, membership caps).
-- ============================================================================

-- Generate a 6-character invite code ------------------------------------------
-- Alphabet deliberately excludes confusable chars: 0/O, 1/I/L.
-- Collision rate at 15M codes: still < 0.001%. No retry logic needed at our scale.
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- Create a circle -------------------------------------------------------------
-- Atomically: creates the circle, generates unique invite code, adds creator
-- as owner member.
create or replace function public.create_circle(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle_id uuid;
  v_code text;
  v_attempts int := 0;
  v_user_id uuid := auth.uid();
  v_active_circles int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Cap: a user can be in at most 3 circles at v1.
  select count(*) into v_active_circles
  from public.memberships
  where user_id = v_user_id and left_at is null;

  if v_active_circles >= 3 then
    raise exception 'circle limit reached (max 3)';
  end if;

  -- Generate a unique invite code. Retry up to 5x on collision.
  loop
    v_code := generate_invite_code();
    v_attempts := v_attempts + 1;
    exit when not exists (
      select 1 from public.circles where invite_code = v_code and deleted_at is null
    );
    if v_attempts > 5 then
      raise exception 'could not generate unique invite code';
    end if;
  end loop;

  -- Create the circle
  insert into public.circles (name, invite_code, created_by, member_count)
  values (p_name, v_code, v_user_id, 1)
  returning id into v_circle_id;

  -- Add creator as owner
  insert into public.memberships (circle_id, user_id, role)
  values (v_circle_id, v_user_id, 'owner');

  -- Default notification prefs (off, per brand)
  insert into public.notification_prefs (user_id, circle_id)
  values (v_user_id, v_circle_id);

  return v_circle_id;
end;
$$;

-- Join a circle via invite code -----------------------------------------------
-- Validates code, checks member cap, enforces per-user circle limit.
create or replace function public.join_circle(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle_id uuid;
  v_current_count int;
  v_user_id uuid := auth.uid();
  v_active_circles int;
  v_already_member boolean;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Find the circle
  select id, member_count into v_circle_id, v_current_count
  from public.circles
  where invite_code = upper(p_code) and deleted_at is null;

  if v_circle_id is null then
    raise exception 'invalid invite code';
  end if;

  -- Check: already a member (active or previously left)?
  select exists (
    select 1 from public.memberships
    where circle_id = v_circle_id and user_id = v_user_id
  ) into v_already_member;

  if v_already_member then
    -- Rejoin: clear left_at
    update public.memberships
    set left_at = null, joined_at = now()
    where circle_id = v_circle_id and user_id = v_user_id;
    return v_circle_id;
  end if;

  -- Cap: circle is full (15 members).
  if v_current_count >= 15 then
    raise exception 'circle is full';
  end if;

  -- Cap: user is in 3 circles already.
  select count(*) into v_active_circles
  from public.memberships
  where user_id = v_user_id and left_at is null;

  if v_active_circles >= 3 then
    raise exception 'circle limit reached (max 3)';
  end if;

  -- Add membership and bump count atomically
  insert into public.memberships (circle_id, user_id)
  values (v_circle_id, v_user_id);

  update public.circles
  set member_count = member_count + 1
  where id = v_circle_id;

  insert into public.notification_prefs (user_id, circle_id)
  values (v_user_id, v_circle_id);

  return v_circle_id;
end;
$$;

-- Leave a circle --------------------------------------------------------------
-- Soft-leave: sets left_at. Preserves audit trail.
-- If the owner leaves, ownership transfers to the next-oldest member.
-- If the last member leaves, circle is soft-deleted.
create or replace function public.leave_circle(p_circle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_remaining int;
  v_next_owner uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select role = 'owner' into v_is_owner
  from public.memberships
  where circle_id = p_circle_id and user_id = v_user_id and left_at is null;

  if v_is_owner is null then
    raise exception 'not a member of this circle';
  end if;

  -- Mark as left
  update public.memberships
  set left_at = now()
  where circle_id = p_circle_id and user_id = v_user_id and left_at is null;

  update public.circles
  set member_count = member_count - 1
  where id = p_circle_id;

  -- Check remaining members
  select count(*) into v_remaining
  from public.memberships
  where circle_id = p_circle_id and left_at is null;

  if v_remaining = 0 then
    -- Last one out, soft-delete the circle
    update public.circles
    set deleted_at = now()
    where id = p_circle_id;
    return;
  end if;

  -- Transfer ownership if the leaver was the owner
  if v_is_owner then
    select user_id into v_next_owner
    from public.memberships
    where circle_id = p_circle_id and left_at is null
    order by joined_at asc
    limit 1;

    update public.memberships
    set role = 'owner'
    where circle_id = p_circle_id and user_id = v_next_owner;
  end if;
end;
$$;

-- Get circle feed -------------------------------------------------------------
-- Returns posts + author info for a circle, chronological newest-first.
-- Paginated via cursor (created_at). Default 30 items.
create or replace function public.get_circle_feed(
  p_circle_id uuid,
  p_before timestamptz default null,
  p_limit int default 30
)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  body text,
  photo_url text,
  reaction_counts jsonb,
  user_reactions text[],
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.author_id,
    prof.display_name as author_name,
    prof.avatar_url as author_avatar,
    p.body,
    p.photo_url,
    coalesce(
      (select jsonb_object_agg(kind, cnt)
       from (
         select kind, count(*) as cnt
         from public.reactions
         where post_id = p.id
         group by kind
       ) r),
      '{}'::jsonb
    ) as reaction_counts,
    coalesce(
      (select array_agg(kind)
       from public.reactions
       where post_id = p.id and user_id = auth.uid()),
      '{}'::text[]
    ) as user_reactions,
    p.created_at
  from public.posts p
  join public.profiles prof on prof.id = p.author_id
  where p.circle_id = p_circle_id
    and p.deleted_at is null
    and (p_before is null or p.created_at < p_before)
    and is_circle_member(p_circle_id)
  order by p.created_at desc
  limit least(p_limit, 50);
$$;
