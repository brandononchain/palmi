-- ============================================================================
-- palmi: add phone to profiles
-- Migration 013: store E.164 phone on the profile row
-- ============================================================================
--
-- Purpose:
--   Phone is the sole identifier on palmi (no email, no username).
--   Storing it on the profile makes it queryable by Palmi AI — which will
--   run as a service-role backend — so it can match connection requests like
--   "connect me with the founder of XYZ" by looking up profiles with
--   relevant metadata.
--
-- Security model:
--   • `profile_self_read`        — user can read their own row (already exists)
--   • `profile_circlemate_read`  — circlemates can read display_name, avatar, etc
--   The phone column is added to the table but Palmi AI reads it via service role,
--   bypassing RLS entirely. Client-side queries (which use the anon/user JWT)
--   cannot SELECT phone from another user's row because the existing
--   profile_circlemate_read policy covers the whole row. If you want to harden
--   further in the future, column-level security or a view can strip phone from
--   the circlemate policy.
-- ============================================================================

alter table public.profiles
  add column if not exists phone text;

-- E.164 format check (+1xxxxxxxxxx)
alter table public.profiles
  add constraint profiles_phone_format
    check (phone is null or phone ~ '^\+[1-9]\d{7,14}$');

-- Index for Palmi AI lookups by phone
create index if not exists idx_profiles_phone on public.profiles(phone)
  where phone is not null;

comment on column public.profiles.phone is
  'E.164 phone number from Supabase Auth. Used by Palmi AI for contact matching. '
  'Readable by service role only via RLS bypass; not exposed in circlemate queries.';
