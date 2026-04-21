-- ============================================================================
-- palmi: core schema
-- Migration 001: tables, indexes, foreign keys
-- ============================================================================
--
-- Design principles:
-- 1. Every posting table has circle_id as the RLS anchor
-- 2. Soft deletes only (deleted_at) - never hard delete user content
-- 3. All timestamps in UTC (timestamptz), local time derived client-side
-- 4. UUIDs as primary keys (distributed-safe, no integer leakage)
-- 5. No followers table. Relationships exist only via memberships.
-- ============================================================================

-- Extensions ------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
-- pg_cron is enabled on Supabase via dashboard (Database -> Extensions).
-- Used by the daily question curator and recap writer schedules.
-- create extension if not exists "pg_cron";  -- enable in Supabase dashboard

-- Auth schema stub ------------------------------------------------------------
-- On Supabase, auth.uid() is provided by the platform (reads from JWT).
-- This stub exists so migrations parse in plain Postgres for local testing.
-- Supabase's real auth.uid() overrides this on deploy.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid() returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Profiles --------------------------------------------------------------------
-- Extends auth.users (Supabase Auth) with the app-specific profile fields.
-- Kept deliberately minimal. No bio, no stats, no public profile surface.
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null check (char_length(display_name) between 1 and 40),
  avatar_url      text,
  timezone        text not null default 'UTC',     -- IANA tz, e.g. 'America/Chicago'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_profiles_created on public.profiles(created_at desc);

-- Circles ---------------------------------------------------------------------
-- A "circle" is a closed friend group. 2-15 members. Invite-only.
create table public.circles (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null check (char_length(name) between 1 and 40),
  invite_code     text not null unique check (char_length(invite_code) = 6),
  created_by      uuid not null references public.profiles(id),
  member_count    int not null default 1 check (member_count between 0 and 15),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index idx_circles_invite_code on public.circles(invite_code) where deleted_at is null;
create index idx_circles_created_by on public.circles(created_by);

-- Memberships -----------------------------------------------------------------
-- Join table: who is in which circle. A user may be in at most 3 circles at v1.
create table public.memberships (
  id              uuid primary key default uuid_generate_v4(),
  circle_id       uuid not null references public.circles(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'member' check (role in ('member', 'owner')),
  joined_at       timestamptz not null default now(),
  left_at         timestamptz,                     -- soft leave for audit trail

  unique(circle_id, user_id)
);

create index idx_memberships_user on public.memberships(user_id) where left_at is null;
create index idx_memberships_circle on public.memberships(circle_id) where left_at is null;

-- Posts -----------------------------------------------------------------------
-- A post belongs to exactly one circle. Photo, text, or both.
create table public.posts (
  id              uuid primary key default uuid_generate_v4(),
  circle_id       uuid not null references public.circles(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) on delete cascade,
  body            text check (char_length(body) <= 500),
  photo_url       text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  -- At least one of body or photo must be present
  constraint post_has_content check (body is not null or photo_url is not null)
);

create index idx_posts_circle_feed on public.posts(circle_id, created_at desc) where deleted_at is null;
create index idx_posts_author on public.posts(author_id, created_at desc);

-- Reactions -------------------------------------------------------------------
-- Four preset emoji reactions. No free-form reactions in v1.
-- Unique(post_id, user_id, kind) prevents spam tapping.
create table public.reactions (
  id              uuid primary key default uuid_generate_v4(),
  post_id         uuid not null references public.posts(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  kind            text not null check (kind in ('heart', 'laugh', 'wow', 'support')),
  created_at      timestamptz not null default now(),

  unique(post_id, user_id, kind)
);

create index idx_reactions_post on public.reactions(post_id);

-- Daily Questions -------------------------------------------------------------
-- One question per circle per day. Generated by the AI Curator agent at 8:30am
-- local time per circle, or pulled from the fallback bank if AI output fails.
create table public.daily_questions (
  id              uuid primary key default uuid_generate_v4(),
  circle_id       uuid not null references public.circles(id) on delete cascade,
  question_text   text not null check (char_length(question_text) between 5 and 200),
  source          text not null check (source in ('ai', 'fallback')),
  drops_at        timestamptz not null,             -- when it appears to users (UTC)
  drops_on        date not null,                     -- calendar day (circle's local tz at write time)
  created_at      timestamptz not null default now(),

  -- One question per circle per calendar day
  unique(circle_id, drops_on)
);

create index idx_daily_questions_circle_date on public.daily_questions(circle_id, drops_at desc);

-- Question Answers ------------------------------------------------------------
-- A member's answer to a daily question. One per member per question.
create table public.question_answers (
  id              uuid primary key default uuid_generate_v4(),
  question_id     uuid not null references public.daily_questions(id) on delete cascade,
  circle_id       uuid not null references public.circles(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) on delete cascade,
  body            text check (char_length(body) <= 300),
  photo_url       text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  unique(question_id, author_id),
  constraint answer_has_content check (body is not null or photo_url is not null)
);

create index idx_answers_question on public.question_answers(question_id, created_at);

-- Fallback Question Bank ------------------------------------------------------
-- ~500 curated questions written by humans. Seeded on install, expanded over time.
-- Used when AI Curator output fails quality gates.
create table public.fallback_questions (
  id              uuid primary key default uuid_generate_v4(),
  question_text   text not null,
  tags            text[] default '{}',              -- e.g. {'morning','playful','sensory'}
  active          boolean not null default true,
  times_used      int not null default 0,
  created_at      timestamptz not null default now()
);

create index idx_fallback_active on public.fallback_questions(active, times_used);

-- Moderation Events -----------------------------------------------------------
-- Every post/answer is screened by the Moderator agent before publication.
-- Flagged content is held for review; this table is the audit log.
create table public.moderation_events (
  id              uuid primary key default uuid_generate_v4(),
  content_type    text not null check (content_type in ('post', 'answer')),
  content_id      uuid not null,
  verdict         text not null check (verdict in ('pass', 'hold', 'reject')),
  categories      text[] default '{}',              -- e.g. {'nsfw','self_harm'}
  score           numeric(3,2),                     -- 0.00 - 1.00 confidence
  model           text,                              -- model name for audit
  created_at      timestamptz not null default now()
);

create index idx_moderation_content on public.moderation_events(content_type, content_id);

-- Circle Recaps ---------------------------------------------------------------
-- Monthly AI-generated recap per circle. Written by the Recap agent.
create table public.recaps (
  id              uuid primary key default uuid_generate_v4(),
  circle_id       uuid not null references public.circles(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  body            text not null,
  source          text not null check (source in ('ai', 'template')),
  created_at      timestamptz not null default now(),

  unique(circle_id, period_start)
);

create index idx_recaps_circle on public.recaps(circle_id, period_start desc);

-- Push Tokens -----------------------------------------------------------------
-- Per-device push notification tokens. A user can have multiple devices.
create table public.push_tokens (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  token           text not null,
  platform        text not null check (platform in ('ios', 'android')),
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(user_id, token)
);

create index idx_push_tokens_user on public.push_tokens(user_id) where enabled = true;

-- Notification Preferences ----------------------------------------------------
-- Per-circle notification preferences. OFF by default (the brand is calm).
create table public.notification_prefs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  circle_id       uuid not null references public.circles(id) on delete cascade,
  daily_question  boolean not null default false,
  new_posts       boolean not null default false,
  reactions       boolean not null default false,

  unique(user_id, circle_id)
);
