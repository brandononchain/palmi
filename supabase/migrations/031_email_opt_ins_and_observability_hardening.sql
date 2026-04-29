-- ============================================================================
-- palmi: email opt-in schema sync + observability hardening
-- Migration 031: codify public.email_opt_ins and reduce public observability exposure
-- ============================================================================

create extension if not exists "uuid-ossp";

create table if not exists public.email_opt_ins (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  source text not null default 'palmi_waitlist',
  referrer_url text,
  consent boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint email_opt_ins_email_shape check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  constraint email_opt_ins_email_normalized check (email = lower(trim(both from email)))
);

create index if not exists idx_email_opt_ins_created_at
  on public.email_opt_ins (created_at desc);

create index if not exists idx_email_opt_ins_source
  on public.email_opt_ins (source, created_at desc);

alter table public.email_opt_ins enable row level security;

drop policy if exists "anon can insert email opt ins" on public.email_opt_ins;
create policy "anon can insert email opt ins" on public.email_opt_ins
  for insert
  to anon
  with check (
    consent = true
    and email = lower(trim(both from email))
    and char_length(email) <= 320
  );

revoke all on public.llm_agent_hourly from anon, authenticated;
revoke all on public.llm_calls from anon, authenticated;

alter function public.guard_circle_billing_columns() set search_path = public;
alter function public.guard_profile_billing_columns() set search_path = public;
alter function public.touch_circle_profile() set search_path = public;