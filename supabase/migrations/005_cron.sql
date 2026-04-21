-- ============================================================================
-- palmi: scheduled jobs
-- Migration 005: pg_cron schedules
-- ============================================================================
--
-- Requires pg_cron extension (enable via Supabase Dashboard → Database → Extensions)
-- and pg_net (also in dashboard) for HTTP calls from inside Postgres.
--
-- Jobs:
--   curate-question  runs every hour on the :00 mark
--                    calls the Edge Function, which iterates circles whose
--                    local 9am is in the current hour.
-- ============================================================================

-- Required extensions -- enable these in the Supabase Dashboard first.
-- create extension if not exists "pg_cron";
-- create extension if not exists "pg_net";

-- Store the Edge Function URL + service role key as database settings so we
-- don't hardcode them. Run this ONCE manually in the SQL editor with your
-- actual values before scheduling:
--
--   alter database postgres set app.edge_base_url to 'https://<project-ref>.supabase.co/functions/v1';
--   alter database postgres set app.service_role_key to '<your-service-role-key>';
--
-- Then reconnect / reload the session so current_setting() picks them up.

-- Helper function to invoke an Edge Function via pg_net (async HTTP POST)
create or replace function public.invoke_edge_function(function_name text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
  v_request_id bigint;
begin
  v_url := current_setting('app.edge_base_url', true) || '/' || function_name;
  v_key := current_setting('app.service_role_key', true);

  if v_url is null or v_key is null then
    raise exception 'edge function settings not configured';
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  return v_request_id;
end;
$$;

-- Schedule: every hour at :00, invoke the curator
-- Only run this AFTER setting app.edge_base_url and app.service_role_key above.
--
-- select cron.schedule(
--   'curate-questions-hourly',
--   '0 * * * *',
--   $$ select public.invoke_edge_function('curate-question'); $$
-- );

-- To unschedule later:
--   select cron.unschedule('curate-questions-hourly');
