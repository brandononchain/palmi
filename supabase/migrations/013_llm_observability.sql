-- ============================================================================
-- 013_llm_observability.sql
-- Per-call observability for LLM usage. Every agent's call to Anthropic
-- lands here so we can track cost, latency, error rate, and fail-open rate
-- across curate-question, write-recap, and moderate-content.
-- ============================================================================

create table if not exists public.llm_calls (
  id                uuid primary key default gen_random_uuid(),
  -- Which agent made the call.
  agent             text not null,
  -- Model name at time of call (so we keep history across model upgrades).
  model             text not null,
  -- Final outcome: 'ok' | 'retried_ok' | 'http_error' | 'parse_error'
  --              | 'timeout' | 'exception'
  status            text not null,
  http_status       int,
  attempt_count     int not null default 1,
  duration_ms       int not null,
  input_tokens      int,
  output_tokens     int,
  -- USD * 1_000_000 for fixed-point math. Avoids float drift when summing.
  cost_usd_micro    bigint,
  circle_id         uuid references public.circles(id) on delete set null,
  -- Short machine-readable reason, e.g. "529_overloaded", "json_parse_failed".
  error_reason      text,
  created_at        timestamptz not null default now()
);

create index if not exists llm_calls_agent_created_idx
  on public.llm_calls (agent, created_at desc);
create index if not exists llm_calls_status_created_idx
  on public.llm_calls (status, created_at desc);

-- No end-user access. Service role bypasses RLS.
alter table public.llm_calls enable row level security;

-- Hourly rollup for dashboards. Re-create each migration run.
create or replace view public.llm_agent_hourly as
select
  agent,
  date_trunc('hour', created_at)                          as hour,
  count(*)                                                 as total,
  count(*) filter (where status in ('ok','retried_ok'))    as ok,
  count(*) filter (where status not in ('ok','retried_ok')) as failed,
  sum(cost_usd_micro) / 1000000.0                          as cost_usd,
  avg(duration_ms)::int                                    as avg_ms,
  sum(input_tokens)                                        as input_tokens,
  sum(output_tokens)                                       as output_tokens
from public.llm_calls
group by agent, date_trunc('hour', created_at);
