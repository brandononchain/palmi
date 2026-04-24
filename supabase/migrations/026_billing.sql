-- ============================================================================
-- palmi: billing foundation
-- Migration 026: subscription tier columns, billing events, discovery quota
-- ============================================================================
--
-- Design:
-- - Tier columns on profiles/circles are WRITE-RESTRICTED to service_role.
--   Only the stripe-webhook edge function mutates them (via service key).
-- - billing_events is append-only and idempotent via stripe_event_id unique.
-- - discovery_quota resets by period_start (first of month).
-- - No PII in billing_events.payload beyond what Stripe already returns.
-- ============================================================================

-- Profiles: subscription fields -----------------------------------------------
alter table public.profiles
  add column if not exists stripe_customer_id text unique,
  add column if not exists subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'premium', 'premium_plus')),
  add column if not exists subscription_status text not null default 'none'
    check (subscription_status in ('none', 'active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists premium_since timestamptz;

create index if not exists idx_profiles_subscription_tier
  on public.profiles(subscription_tier)
  where subscription_tier <> 'free';

-- Circles: paid-circle fields -------------------------------------------------
alter table public.circles
  add column if not exists tier text not null default 'free'
    check (tier in ('free', 'paid')),
  add column if not exists host_stripe_subscription_id text,
  add column if not exists paid_since timestamptz;

create index if not exists idx_circles_tier
  on public.circles(tier)
  where tier = 'paid' and deleted_at is null;

-- billing_events --------------------------------------------------------------
-- Append-only log of every Stripe webhook we process. Idempotent.
create table if not exists public.billing_events (
  id              uuid primary key default uuid_generate_v4(),
  stripe_event_id text not null unique,
  type            text not null,
  user_id         uuid references public.profiles(id),
  circle_id       uuid references public.circles(id),
  payload         jsonb not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_billing_events_user on public.billing_events(user_id, created_at desc);
create index if not exists idx_billing_events_circle on public.billing_events(circle_id, created_at desc);

-- discovery_quota -------------------------------------------------------------
-- One row per user per calendar month. Upserted on each discovery call.
create table if not exists public.discovery_quota (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  period_start    date not null,
  searches_used   int not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (user_id, period_start)
);

-- institutional_leads ---------------------------------------------------------
-- Captured from landing-page form. Sales-assisted; no self-serve.
create table if not exists public.institutional_leads (
  id              uuid primary key default uuid_generate_v4(),
  contact_name    text not null,
  email           citext not null,
  org             text not null,
  use_case        text,
  circle_count    int,
  budget_band     text,
  status          text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_institutional_leads_status on public.institutional_leads(status, created_at desc);

-- personal_reflections --------------------------------------------------------
-- AI-generated monthly "your month" paragraph for premium users (Phase 1d).
create table if not exists public.personal_reflections (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  body            text not null,
  source          text not null default 'ai' check (source in ('ai', 'template')),
  created_at      timestamptz not null default now(),
  unique (user_id, period_start)
);

create index if not exists idx_personal_reflections_user
  on public.personal_reflections(user_id, period_start desc);

-- RLS -------------------------------------------------------------------------
alter table public.billing_events        enable row level security;
alter table public.discovery_quota       enable row level security;
alter table public.institutional_leads   enable row level security;
alter table public.personal_reflections  enable row level security;

-- billing_events: users can read their own; only service_role writes.
drop policy if exists "billing_events_read_own" on public.billing_events;
create policy "billing_events_read_own" on public.billing_events
  for select using (auth.uid() = user_id);

-- discovery_quota: users read their own; only service_role writes.
drop policy if exists "discovery_quota_read_own" on public.discovery_quota;
create policy "discovery_quota_read_own" on public.discovery_quota
  for select using (auth.uid() = user_id);

-- institutional_leads: anonymous can insert (lead capture); no reads for public.
drop policy if exists "institutional_leads_insert_anon" on public.institutional_leads;
create policy "institutional_leads_insert_anon" on public.institutional_leads
  for insert with check (true);

-- personal_reflections: users read their own; only service_role writes.
drop policy if exists "personal_reflections_read_own" on public.personal_reflections;
create policy "personal_reflections_read_own" on public.personal_reflections
  for select using (auth.uid() = user_id);

-- Protect subscription columns from client writes -----------------------------
-- Existing profiles UPDATE policies (002_rls.sql) allow users to update their
-- own row. We layer a trigger that raises on any attempt to mutate billing
-- columns unless the caller is service_role.
create or replace function public.guard_profile_billing_columns()
returns trigger
language plpgsql
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if new.stripe_customer_id       is distinct from old.stripe_customer_id
  or new.subscription_tier        is distinct from old.subscription_tier
  or new.subscription_status      is distinct from old.subscription_status
  or new.stripe_subscription_id   is distinct from old.stripe_subscription_id
  or new.current_period_end       is distinct from old.current_period_end
  or new.premium_since            is distinct from old.premium_since then
    raise exception 'billing columns are read-only to client';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_billing on public.profiles;
create trigger trg_guard_profile_billing
  before update on public.profiles
  for each row
  execute function public.guard_profile_billing_columns();

-- Same for circles.tier / host_stripe_subscription_id / paid_since ------------
create or replace function public.guard_circle_billing_columns()
returns trigger
language plpgsql
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if new.tier                        is distinct from old.tier
  or new.host_stripe_subscription_id is distinct from old.host_stripe_subscription_id
  or new.paid_since                  is distinct from old.paid_since then
    raise exception 'circle billing columns are read-only to client';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_circle_billing on public.circles;
create trigger trg_guard_circle_billing
  before update on public.circles
  for each row
  execute function public.guard_circle_billing_columns();
