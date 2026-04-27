-- ============================================================================
-- palmi: public email opt-ins
-- Migration 002: landing-page waitlist capture
-- ============================================================================

create table if not exists public.email_opt_ins (
  id            uuid primary key default uuid_generate_v4(),
  email         text not null,
  source        text not null default 'palmi_waitlist',
  referrer_url  text,
  consent       boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  constraint email_opt_ins_email_normalized check (email = lower(trim(email))),
  constraint email_opt_ins_email_shape check (
    email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
  )
);

create unique index if not exists email_opt_ins_email_key on public.email_opt_ins(email);
create index if not exists idx_email_opt_ins_created_at on public.email_opt_ins(created_at desc);
create index if not exists idx_email_opt_ins_source on public.email_opt_ins(source, created_at desc);

alter table public.email_opt_ins enable row level security;

-- Allow the public landing page to add waitlist records using the anon key.
-- Updates are intentionally handled server-side with the service role when available.
drop policy if exists "anon can insert email opt ins" on public.email_opt_ins;
create policy "anon can insert email opt ins"
on public.email_opt_ins
for insert
to anon
with check (
  consent = true
  and email = lower(trim(email))
  and char_length(email) <= 320
);
