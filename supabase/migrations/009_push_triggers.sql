-- ============================================================================
-- palmi: Expo Push triggers
-- Migration 009: async push on daily_questions, posts, reactions
-- ============================================================================
--
-- Fan-out model: every insert on a trigger-ed table looks up the recipients'
-- push_tokens filtered by their per-circle notification_prefs, then uses
-- pg_net.http_post to dispatch to the Expo Push API.
--
-- Prerequisites: pg_net extension enabled (Supabase dashboard).
--
-- Brand rules encoded here:
--   - All toggles default OFF — these triggers send nothing until a user
--     explicitly opts in per circle.
--   - Copy never uses FOMO language (see string literals below).
--   - Reactions: silent push with badge only, no title or body.
--   - No self-notifications (you don't get pinged for your own post/reaction).
--   - Held/rejected content never generates notifications (moderation_status).
-- ============================================================================

create extension if not exists pg_net;


-- Helper: send one Expo push for each provided token -------------------------
-- title+body nullable so reactions can send a silent badge-only push.
create or replace function public.send_expo_push(
  p_tokens text[],
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_payload jsonb;
begin
  if p_tokens is null or array_length(p_tokens, 1) is null then
    return;
  end if;

  foreach v_token in array p_tokens loop
    v_payload := jsonb_build_object(
      'to', v_token,
      'sound', null,
      'data', p_data
    );
    if p_title is not null then
      v_payload := v_payload || jsonb_build_object('title', p_title);
    end if;
    if p_body is not null then
      v_payload := v_payload || jsonb_build_object('body', p_body);
    end if;
    -- Reaction case: badge-only, silent.
    if p_title is null and p_body is null then
      v_payload := v_payload || jsonb_build_object(
        '_contentAvailable', true,
        'badge', 1,
        'priority', 'default'
      );
    end if;

    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      ),
      body := v_payload
    );
  end loop;
end;
$$;


-- Trigger: daily question dropped --------------------------------------------
-- Copy: "nineish. today's question just dropped in <circle_name>."
create or replace function public.tg_notify_daily_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle_name text;
  v_tokens text[];
  v_body text;
begin
  select name into v_circle_name from public.circles where id = new.circle_id;

  select coalesce(array_agg(t.token), '{}')
    into v_tokens
  from public.notification_prefs np
  join public.memberships m
    on m.user_id = np.user_id
   and m.circle_id = np.circle_id
   and m.left_at is null
  join public.push_tokens t
    on t.user_id = np.user_id
   and t.enabled = true
  where np.circle_id = new.circle_id
    and np.daily_question = true;

  if array_length(v_tokens, 1) is null then return new; end if;

  v_body := 'nineish. today''s question just dropped in ' || coalesce(v_circle_name, 'your circle') || '.';

  perform public.send_expo_push(
    v_tokens,
    null,
    v_body,
    jsonb_build_object('type', 'daily_question', 'circle_id', new.circle_id, 'question_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists notify_daily_question on public.daily_questions;
create trigger notify_daily_question
  after insert on public.daily_questions
  for each row execute function public.tg_notify_daily_question();


-- Trigger: new post ----------------------------------------------------------
-- Copy: "<display_name> shared something in <circle_name>."
-- Skipped when moderation_status != 'ok'. Skipped for the author themselves.
create or replace function public.tg_notify_new_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle_name text;
  v_author_name text;
  v_tokens text[];
  v_body text;
begin
  if new.moderation_status <> 'ok' then return new; end if;

  select name into v_circle_name from public.circles where id = new.circle_id;
  select display_name into v_author_name from public.profiles where id = new.author_id;

  select coalesce(array_agg(t.token), '{}')
    into v_tokens
  from public.notification_prefs np
  join public.memberships m
    on m.user_id = np.user_id
   and m.circle_id = np.circle_id
   and m.left_at is null
  join public.push_tokens t
    on t.user_id = np.user_id
   and t.enabled = true
  where np.circle_id = new.circle_id
    and np.new_posts = true
    and np.user_id <> new.author_id;

  if array_length(v_tokens, 1) is null then return new; end if;

  v_body := coalesce(v_author_name, 'someone') || ' shared something in ' || coalesce(v_circle_name, 'your circle') || '.';

  perform public.send_expo_push(
    v_tokens,
    null,
    v_body,
    jsonb_build_object('type', 'new_post', 'circle_id', new.circle_id, 'post_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists notify_new_post on public.posts;
create trigger notify_new_post
  after insert on public.posts
  for each row execute function public.tg_notify_new_post();


-- Trigger: new reaction ------------------------------------------------------
-- Silent push (title/body null) — badge-only, per spec.
-- Only fires for the post author, never for the reactor themselves.
create or replace function public.tg_notify_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
  v_circle_id uuid;
  v_pref boolean;
  v_tokens text[];
begin
  select author_id, circle_id into v_post_author, v_circle_id
    from public.posts where id = new.post_id;

  if v_post_author is null or v_post_author = new.user_id then return new; end if;

  select reactions into v_pref
    from public.notification_prefs
    where user_id = v_post_author and circle_id = v_circle_id;
  if coalesce(v_pref, false) = false then return new; end if;

  select coalesce(array_agg(token), '{}') into v_tokens
    from public.push_tokens
    where user_id = v_post_author and enabled = true;

  if array_length(v_tokens, 1) is null then return new; end if;

  perform public.send_expo_push(
    v_tokens,
    null,
    null,
    jsonb_build_object('type', 'reaction', 'post_id', new.post_id, 'kind', new.kind)
  );
  return new;
end;
$$;

drop trigger if exists notify_reaction on public.reactions;
create trigger notify_reaction
  after insert on public.reactions
  for each row execute function public.tg_notify_reaction();
