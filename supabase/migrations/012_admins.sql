-- ============================================================================
-- palmi: Admin allowlist (for admin dashboard at palmi.app/admin)
-- Migration 012
-- ============================================================================
-- Membership here ≠ product feature. Pure gate for the web admin dashboard.
-- Managed by hand via SQL; no UI to self-promote.
-- ============================================================================

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  added_at   timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Only service role reads. No anon/authenticated policies = no access from
-- clients even with a valid JWT. The dashboard uses service role + a header
-- check, not direct client reads.
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = p_user_id);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to service_role;

comment on table public.admins is 'Allowlist for admin dashboard access. Managed manually via SQL.';
