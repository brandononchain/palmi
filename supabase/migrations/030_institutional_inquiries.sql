-- palmi: institutional inquiries
-- Dedicated inbound flow for universities, accelerators, cohorts, and programs.

create table if not exists public.institutional_inquiries (
  id uuid primary key default uuid_generate_v4(),
  organization_name text not null check (char_length(organization_name) between 2 and 160),
  work_email text not null check (char_length(work_email) between 5 and 320),
  program_type text not null check (program_type in ('university', 'accelerator', 'cohort', 'community', 'other')),
  cohort_size text,
  note text,
  source text not null default 'pricing',
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_institutional_inquiries_created
  on public.institutional_inquiries(created_at desc);

create index if not exists idx_institutional_inquiries_status_created
  on public.institutional_inquiries(status, created_at desc);

alter table public.institutional_inquiries enable row level security;

drop policy if exists "institutional_inquiries_no_anon" on public.institutional_inquiries;
create policy "institutional_inquiries_no_anon" on public.institutional_inquiries
  for all using (false) with check (false);