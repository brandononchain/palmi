-- ============================================================================
-- palmi: scheduled circle classification (Phase 1.4)
-- Migration 019: cron entry + helper RPC for classify-circle batch selection.
-- ============================================================================
--
-- Runs daily at 04:17 UTC (off-hour to avoid colliding with curate-question
-- and write-recap which run hourly on the :00 mark). Picks up:
--   - circles with no profile yet (and at least 3 posts+answers — the edge
--     function double-checks this signal threshold), and
--   - circles whose classified_at is older than 7 days,
--   - skipping circles where purpose_locked = true (those refresh manually).
--
-- Like the curate-question and write-recap crons, this depends on:
--   alter database postgres set app.edge_base_url to '...';
--   alter database postgres set app.service_role_key to '...';
-- already being set (see migration 005).
-- ============================================================================

-- Helper RPC: returns circles eligible for classification on the cron path. --
-- Service-role-only; called by the classify-circle edge function which uses
-- the service role key. RLS on circles allows this (security definer).
create or replace function public.circles_needing_classification(
  p_stale_before timestamptz,
  p_limit        int default 50
)
returns table (
  id             uuid,
  name           text,
  purpose_locked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.purpose_locked
  from public.circles c
  left join public.circle_profile cp on cp.circle_id = c.id
  where c.deleted_at is null
    and c.member_count > 0
    and c.purpose_locked = false
    and (cp.classified_at is null or cp.classified_at < p_stale_before)
  order by coalesce(cp.classified_at, 'epoch'::timestamptz) asc, c.created_at asc
  limit p_limit;
$$;

revoke all on function public.circles_needing_classification(timestamptz, int) from public;
grant execute on function public.circles_needing_classification(timestamptz, int) to service_role;

-- Schedule --------------------------------------------------------------------
-- Run once daily; the edge function batches up to 50 circles per call.
-- Once Supabase has more circles than that, increase BATCH_LIMIT in the
-- function or schedule more frequently.
--
-- Uncomment after edge function is deployed and app.* settings are configured:
--
-- select cron.schedule(
--   'classify-circles-daily',
--   '17 4 * * *',
--   $$ select public.invoke_edge_function('classify-circle'); $$
-- );
--
-- To unschedule:
--   select cron.unschedule('classify-circles-daily');
