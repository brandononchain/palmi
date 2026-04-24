-- ============================================================================
-- palmi: waitlist email consent + delivery tracking
-- Migration 028: explicit opt-in and confirmation email bookkeeping
-- ============================================================================

alter table public.waitlist
  add column if not exists email_opt_in boolean not null default false,
  add column if not exists email_opted_in_at timestamptz,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists confirmation_email_provider_id text;

update public.waitlist
set email_opted_in_at = created_at
where email_opt_in = true
  and email_opted_in_at is null;

comment on column public.waitlist.email_opt_in is
  'True when the user explicitly opts into waitlist/access emails.';

comment on column public.waitlist.email_opted_in_at is
  'Timestamp when the user explicitly opted into waitlist emails.';

comment on column public.waitlist.confirmation_email_sent_at is
  'Timestamp of the first waitlist confirmation email sent to this address.';

comment on column public.waitlist.confirmation_email_provider_id is
  'Provider-specific id for the confirmation email, when available.';