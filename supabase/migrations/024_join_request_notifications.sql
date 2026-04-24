-- ============================================================================
-- palmi: join request notifications
-- Migration 024: notification_prefs.join_requests + push trigger for owners
-- ============================================================================
--
-- When someone asks to join a discoverable circle the owner should hear about
-- it once. We add a per-circle preference (default ON only for owners) and a
-- trigger that fans out to enabled push tokens.
--
-- Brand rules: calm, single push, no FOMO, no badge spam.
-- ============================================================================

-- 1. New preference column. Default false matches the rest of notification_prefs;
--    we flip it to true for existing owners and for any newly-approved owner via
--    the membership flow below.
alter table public.notification_prefs
  add column if not exists join_requests boolean not null default false;

-- Backfill: existing owners get the toggle on so they don't miss requests.
update public.notification_prefs np
   set join_requests = true
  from public.memberships m
 where m.user_id = np.user_id
   and m.circle_id = np.circle_id
   and m.left_at is null
   and m.role = 'owner';

-- 2. Push trigger fired when a new pending request arrives. We do not push for
--    auto-approved rows (those land directly in approved status via the
--    screening function path) — only for status='pending' inserts where the
--    owner needs to act.
create or replace function public.tg_notify_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle_name text;
  v_requester_name text;
  v_tokens text[];
  v_body text;
begin
  if new.status <> 'pending' then return new; end if;

  select name into v_circle_name from public.circles where id = new.circle_id;
  select display_name into v_requester_name from public.profiles where id = new.requester_id;

  -- Owners of this circle who have join_requests enabled and a push token.
  select coalesce(array_agg(t.token), '{}')
    into v_tokens
  from public.memberships m
  join public.notification_prefs np
    on np.user_id = m.user_id
   and np.circle_id = m.circle_id
  join public.push_tokens t
    on t.user_id = m.user_id
   and t.enabled = true
  where m.circle_id = new.circle_id
    and m.role = 'owner'
    and m.left_at is null
    and np.join_requests = true;

  if array_length(v_tokens, 1) is null then return new; end if;

  v_body := coalesce(v_requester_name, 'someone') ||
            ' would like to join ' ||
            coalesce(v_circle_name, 'your circle') || '.';

  perform public.send_expo_push(
    v_tokens,
    null,
    v_body,
    jsonb_build_object(
      'type', 'join_request',
      'circle_id', new.circle_id,
      'request_id', new.id
    )
  );
  return new;
end;
$$;

drop trigger if exists notify_join_request on public.circle_join_requests;
create trigger notify_join_request
  after insert on public.circle_join_requests
  for each row execute function public.tg_notify_join_request();
