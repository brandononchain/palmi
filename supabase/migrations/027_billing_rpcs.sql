-- ============================================================================
-- palmi: billing RPCs
-- Migration 027: is_premium helpers, modified create_circle, discovery quota
-- ============================================================================

-- is_premium ------------------------------------------------------------------
-- True for premium or premium_plus with an active subscription.
create or replace function public.is_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user
      and subscription_tier in ('premium', 'premium_plus')
      and subscription_status in ('active', 'trialing', 'past_due')
      and (current_period_end is null or current_period_end > now())
  );
$$;

-- is_premium_plus -------------------------------------------------------------
create or replace function public.is_premium_plus(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user
      and subscription_tier = 'premium_plus'
      and subscription_status in ('active', 'trialing', 'past_due')
      and (current_period_end is null or current_period_end > now())
  );
$$;

-- circle_is_paid --------------------------------------------------------------
create or replace function public.circle_is_paid(p_circle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.circles
    where id = p_circle and tier = 'paid' and deleted_at is null
  );
$$;

-- create_circle: lift the free-circle cap for premium users -----------------
-- Recommended cap: free=2, premium/premium_plus=10. (Plan Further Consideration #4.)
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
  v_cap int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if public.is_premium(v_user_id) then
    v_cap := 10;
  else
    v_cap := 2;
  end if;

  select count(*) into v_active_circles
  from public.memberships
  where user_id = v_user_id and left_at is null;

  if v_active_circles >= v_cap then
    raise exception 'circle limit reached (max %)', v_cap;
  end if;

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

  insert into public.circles (name, invite_code, created_by, member_count)
  values (p_name, v_code, v_user_id, 1)
  returning id into v_circle_id;

  insert into public.memberships (circle_id, user_id, role)
  values (v_circle_id, v_user_id, 'owner');

  insert into public.notification_prefs (user_id, circle_id)
  values (v_user_id, v_circle_id);

  return v_circle_id;
end;
$$;

-- check_discovery_quota -------------------------------------------------------
-- Returns remaining searches for current month. Negative = unlimited.
-- Quotas: free = 3, premium = 10, premium_plus = unlimited (-1).
create or replace function public.check_discovery_quota(p_user uuid)
returns table (remaining int, used int, quota int, tier text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_quota int;
  v_used int;
  v_period date := date_trunc('month', now())::date;
begin
  select subscription_tier into v_tier from public.profiles where id = p_user;

  if v_tier = 'premium_plus' then
    v_quota := -1;
  elsif v_tier = 'premium' then
    v_quota := 10;
  else
    v_quota := 3;
  end if;

  select coalesce(searches_used, 0) into v_used
  from public.discovery_quota
  where user_id = p_user and period_start = v_period;

  v_used := coalesce(v_used, 0);

  return query select
    case when v_quota < 0 then -1 else greatest(v_quota - v_used, 0) end,
    v_used,
    v_quota,
    coalesce(v_tier, 'free');
end;
$$;

-- consume_discovery_quota -----------------------------------------------------
-- Called by discover-circles edge fn. Returns true if allowed to proceed.
create or replace function public.consume_discovery_quota(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_quota int;
  v_period date := date_trunc('month', now())::date;
  v_used int;
begin
  select subscription_tier into v_tier from public.profiles where id = p_user;

  if v_tier = 'premium_plus' then
    v_quota := -1;
  elsif v_tier = 'premium' then
    v_quota := 10;
  else
    v_quota := 3;
  end if;

  insert into public.discovery_quota (user_id, period_start, searches_used)
  values (p_user, v_period, 1)
  on conflict (user_id, period_start)
  do update set searches_used = discovery_quota.searches_used + 1,
                updated_at    = now()
  returning searches_used into v_used;

  if v_quota < 0 then
    return true;
  end if;

  return v_used <= v_quota;
end;
$$;

-- Note on stripe_customer_id persistence:
-- The /api/checkout server route runs with the service-role key. After
-- creating a Stripe customer, it writes stripe_customer_id directly via
-- service-role client. The billing-columns trigger (026) bypasses for
-- service_role, so no RPC wrapper is needed.

grant execute on function public.is_premium(uuid)              to authenticated;
grant execute on function public.is_premium_plus(uuid)         to authenticated;
grant execute on function public.circle_is_paid(uuid)          to authenticated;
grant execute on function public.check_discovery_quota(uuid)   to authenticated;
grant execute on function public.consume_discovery_quota(uuid) to service_role;
