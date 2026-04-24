-- ============================================================================
-- palmi: profile enrichment layer
-- Migration 014: add professional, campus, and location columns to profiles
-- ============================================================================
--
-- Purpose:
--   Powers Palmi AI connection requests across two use cases:
--
--   B2C  — "connect me with someone who went to UT Austin and works in design"
--   B2B  — "connect me with the VP of Engineering at Acme Corp"
--           "our sales team wants a private circle for the Acme account"
--
--   All enrichment lives directly on public.profiles so there is one row per
--   user and no joins needed for AI lookups. All columns are nullable —
--   users fill them in at their own pace.
--
-- Security model:
--   • Existing profile_self_read / profile_self_update policies cover new cols
--   • profile_circlemate_read lets circlemates see company/role context
--   • full_name is private by convention — only Palmi AI backend (service role)
--     reads it; a column-stripping view can be added later if needed
--   • profile_tags table added separately (true 1-to-many, can't inline)
-- ============================================================================

-- ─── Enrichment columns on profiles ──────────────────────────────────────────

alter table public.profiles
  -- Professional (B2B enterprise)
  add column if not exists full_name       text        check (char_length(full_name)   <= 100),
  add column if not exists job_title       text        check (char_length(job_title)   <=  80),
  add column if not exists company         text        check (char_length(company)     <= 100),
  add column if not exists department      text        check (char_length(department)  <=  60),
  add column if not exists industry        text        check (char_length(industry)    <=  60),
  add column if not exists seniority       text        check (seniority in (
                                                         'intern', 'ic', 'manager',
                                                         'director', 'vp', 'c_suite', 'founder', 'other'
                                                       )),
  -- Campus (B2C college / university)
  add column if not exists school          text        check (char_length(school)      <= 100),
  add column if not exists graduation_year smallint    check (graduation_year between 1950 and 2040),

  -- Location
  add column if not exists location_city    text       check (char_length(location_city)    <= 60),
  add column if not exists location_country text       check (char_length(location_country) =   2),  -- ISO 3166-1 alpha-2

  -- Open context
  add column if not exists bio             text        check (char_length(bio)         <= 160),
  add column if not exists website_url     text        check (website_url ~ '^https?://');

comment on column public.profiles.full_name is
  'Private — only read by Palmi AI service role. Not exposed in circlemate queries.';
comment on column public.profiles.seniority is
  'Coarse bucket: intern | ic | manager | director | vp | c_suite | founder | other';
comment on column public.profiles.location_country is
  'ISO 3166-1 alpha-2 country code, e.g. US, GB, CA';
comment on column public.profiles.bio is
  '≤160 chars. Shown in circle member cards.';

-- Indexes for Palmi AI lookups ------------------------------------------------
create index if not exists idx_profiles_company    on public.profiles(lower(company))   where company  is not null;
create index if not exists idx_profiles_industry   on public.profiles(lower(industry))  where industry is not null;
create index if not exists idx_profiles_school     on public.profiles(lower(school))    where school   is not null;
create index if not exists idx_profiles_seniority  on public.profiles(seniority)        where seniority is not null;
create index if not exists idx_profiles_location   on public.profiles(location_country, lower(location_city))
  where location_country is not null;

-- ─── profile_tags ────────────────────────────────────────────────────────────
--
-- Kept as a separate table — it's a true 1-to-many relationship.
-- Users set their own tags; Palmi AI writes ai-inferred tags via service role.
-- Enables queries like: "connect me with someone who knows Rust in fintech"

create table public.profile_tags (
  id          uuid        primary key default uuid_generate_v4(),
  profile_id  uuid        not null references public.profiles(id) on delete cascade,
  tag         text        not null check (char_length(tag) between 1 and 50),
  source      text        not null default 'user'
                          check (source in ('user', 'ai')),
  created_at  timestamptz not null default now()
);

-- Expression-based unique constraint must be a separate index in Postgres
create unique index idx_tags_profile_tag_unique
  on public.profile_tags(profile_id, lower(tag));

create index idx_tags_profile on public.profile_tags(profile_id);
create index idx_tags_tag     on public.profile_tags(lower(tag));

comment on table public.profile_tags is
  'Flexible skill/interest/context tags. source=user: self-declared. '
  'source=ai: inferred by Palmi AI (written via service role, bypasses RLS).';

-- ─── RLS on profile_tags ─────────────────────────────────────────────────────

alter table public.profile_tags enable row level security;

create policy "tags_self_select"
  on public.profile_tags for select
  using (profile_id = auth.uid());

create policy "tags_self_insert"
  on public.profile_tags for insert
  with check (profile_id = auth.uid() and source = 'user');

create policy "tags_self_delete"
  on public.profile_tags for delete
  using (profile_id = auth.uid() and source = 'user');  -- users cannot delete AI tags

-- Circlemates can see tags (helps Palmi surface "Sarah knows Figma")
create policy "tags_circlemate_select"
  on public.profile_tags for select
  using (
    exists (
      select 1
      from public.memberships m1
      join public.memberships m2 on m1.circle_id = m2.circle_id
      where m1.user_id = auth.uid()
        and m2.user_id = profile_tags.profile_id
        and m1.left_at is null
        and m2.left_at is null
    )
  );

