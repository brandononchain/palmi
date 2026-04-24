-- ============================================================================
-- palmi: circle discoverability + admission flow (Phase 2.1)
-- Migration 021: opt-in discovery flags on circles + circle_join_requests.
-- ============================================================================
--
-- Defaults preserve the current trust model:
--   - circles.discoverable defaults to false (every existing circle stays
--     invite-only and invisible to discovery).
--   - admission_mode defaults to 'invite_only'.
--   - discovery_blurb is null until the owner intentionally writes one.
--
-- Owner opts a circle in via the info screen (Phase 2.7). The discover-circles
-- function (Phase 2.3) hard-filters on discoverable=true, so flipping nothing
-- changes nothing.
-- ============================================================================

-- Circles: discoverability fields --------------------------------------------
alter table public.circles
  add column if not exists discoverable    boolean not null default false,
  add column if not exists admission_mode  text    not null default 'invite_only'
    check (admission_mode in ('closed', 'invite_only', 'request', 'open_screened')),
  add column if not exists discovery_blurb text
    check (discovery_blurb is null or char_length(discovery_blurb) between 1 and 200);

-- Cannot enable discovery without a blurb. Enforced as a row-level check so
-- the toggle in the UI must collect the copy first.
alter table public.circles
  drop constraint if exists circles_discoverable_requires_blurb;
alter table public.circles
  add  constraint circles_discoverable_requires_blurb
  check (discoverable = false or discovery_blurb is not null);

-- Discoverable circles need an admission_mode that lets new people in.
alter table public.circles
  drop constraint if exists circles_discoverable_admission_compat;
alter table public.circles
  add  constraint circles_discoverable_admission_compat
  check (discoverable = false or admission_mode in ('request', 'open_screened'));

-- Partial index: discovery only ever scans this slice.
create index if not exists idx_circles_discoverable
  on public.circles (admission_mode)
  where discoverable = true and deleted_at is null;

-- Join requests --------------------------------------------------------------
-- One pending request per (circle, requester). Decisions soft-recorded so we
-- can rate-limit re-requests after a decline (enforced in the RPC, not here).
create table if not exists public.circle_join_requests (
  id              uuid primary key default uuid_generate_v4(),
  circle_id       uuid not null references public.circles(id) on delete cascade,
  requester_id    uuid not null references public.profiles(id) on delete cascade,
  intent_text     text not null check (char_length(intent_text) between 1 and 500),
  status          text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'expired')),
  -- AI screening hint for the owner. 'pending' = not screened yet.
  screening_recommendation text not null default 'pending'
    check (screening_recommendation in ('pending', 'safe_auto_approve', 'needs_owner_review', 'reject')),
  screening_reason text,
  decided_by      uuid references public.profiles(id),
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- Only one pending row per (circle, requester) at a time. Once decided the
-- row stays for audit; a new pending row can be inserted later.
create unique index if not exists idx_join_requests_one_pending
  on public.circle_join_requests (circle_id, requester_id)
  where status = 'pending';

create index if not exists idx_join_requests_circle_pending
  on public.circle_join_requests (circle_id, created_at desc)
  where status = 'pending';

create index if not exists idx_join_requests_requester
  on public.circle_join_requests (requester_id, created_at desc);

-- RLS ------------------------------------------------------------------------
alter table public.circle_join_requests enable row level security;

-- Requester sees their own requests across all circles (so the requesting UI
-- can show "pending / approved / declined"). They never see other requesters.
create policy "join_request_self_read"
  on public.circle_join_requests for select
  using (requester_id = auth.uid());

-- Circle owner sees all requests for their circle. Members (non-owners)
-- intentionally don't see the inbox — this stays a private owner surface.
create policy "join_request_owner_read"
  on public.circle_join_requests for select
  using (
    exists (
      select 1 from public.memberships m
      where m.circle_id = circle_join_requests.circle_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
        and m.left_at is null
    )
  );

-- Inserts go through the request_join_circle RPC (migration 023). Block direct
-- writes by not granting any insert/update policy.
-- (Default = deny under RLS.)

comment on table public.circle_join_requests is
  'Phase 2.1: opt-in join requests against discoverable circles. '
  'Inserts gated by request_join_circle RPC; updates by approve/decline RPCs.';
