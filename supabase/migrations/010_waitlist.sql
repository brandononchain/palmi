-- ============================================================================
-- palmi: Landing-page waitlist
-- Migration 010: waitlist table + RLS (anon INSERT only, service_role SELECT)
-- ============================================================================
-- Scope: collected from palmi.app landing page. Never joined to profiles/users.
-- Contains email addresses (PII), so SELECT is locked to service role.
-- ============================================================================

-- citext extension for case-insensitive email dedup.
create extension if not exists citext;

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      citext not null,
  campus     text,
  source     text not null check (source in ('hero', 'cta')),
  created_at timestamptz not null default now(),
  constraint waitlist_email_key unique (email),
  constraint waitlist_email_shape check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  constraint waitlist_campus_len check (campus is null or char_length(campus) <= 120)
);

create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;

-- Anyone can sign up (including unauthenticated anon key from the landing page).
drop policy if exists waitlist_anon_insert on public.waitlist;
create policy waitlist_anon_insert on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

-- Reads restricted — service role bypasses RLS, so no policy is needed for reads.
-- We intentionally create NO select/update/delete policies, so anon/auth cannot
-- enumerate signups.

comment on table public.waitlist is
  'Landing-page waitlist. Anon can INSERT; reads are service-role only.';
