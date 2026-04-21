-- ============================================================================
-- palmi: row-level security
-- Migration 002: RLS policies
-- ============================================================================
--
-- Core rule: users can only read/write data from circles they're a member of.
-- This is enforced at the DB, not the app — even a compromised client can't
-- read another circle's posts.
-- ============================================================================

-- Helper function: is the current user a member of this circle?
-- Inlined for performance; called in most policies below.
create or replace function public.is_circle_member(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where circle_id = p_circle_id
      and user_id = auth.uid()
      and left_at is null
  );
$$;

-- Enable RLS on all tables ----------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.circles              enable row level security;
alter table public.memberships          enable row level security;
alter table public.posts                enable row level security;
alter table public.reactions            enable row level security;
alter table public.daily_questions      enable row level security;
alter table public.question_answers     enable row level security;
alter table public.fallback_questions   enable row level security;
alter table public.moderation_events    enable row level security;
alter table public.recaps               enable row level security;
alter table public.push_tokens          enable row level security;
alter table public.notification_prefs   enable row level security;

-- Profiles --------------------------------------------------------------------
-- Users see their own profile fully.
-- Users see other profiles ONLY if they share a circle.
-- No public profile directory. Ever.

create policy "profile_self_read"
  on public.profiles for select
  using (id = auth.uid());

create policy "profile_circlemate_read"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.memberships m1
      join public.memberships m2 on m1.circle_id = m2.circle_id
      where m1.user_id = auth.uid()
        and m2.user_id = profiles.id
        and m1.left_at is null
        and m2.left_at is null
    )
  );

create policy "profile_self_update"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profile_self_insert"
  on public.profiles for insert
  with check (id = auth.uid());

-- Circles ---------------------------------------------------------------------
-- Read: only members see the circle record.
-- Create: any authenticated user can start a circle.
-- Update: only the owner (role = 'owner') can rename or delete.

create policy "circle_member_read"
  on public.circles for select
  using (is_circle_member(id) and deleted_at is null);

create policy "circle_create"
  on public.circles for insert
  with check (created_by = auth.uid());

create policy "circle_owner_update"
  on public.circles for update
  using (
    exists (
      select 1 from public.memberships
      where circle_id = circles.id
        and user_id = auth.uid()
        and role = 'owner'
        and left_at is null
    )
  );

-- Memberships -----------------------------------------------------------------
-- Read: members see other members of their circles.
-- Insert: anyone with a valid invite code can join (handled by RPC, not direct insert).
-- Update: users can leave (set left_at on their own row).

create policy "membership_read"
  on public.memberships for select
  using (is_circle_member(circle_id));

create policy "membership_self_insert"
  on public.memberships for insert
  with check (user_id = auth.uid());

create policy "membership_self_leave"
  on public.memberships for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Posts -----------------------------------------------------------------------
-- Read: circle members only.
-- Create: circle members create posts in their circles, authored as themselves.
-- Update/Delete: only the author can modify their own post (soft delete).

create policy "post_member_read"
  on public.posts for select
  using (is_circle_member(circle_id) and deleted_at is null);

create policy "post_member_insert"
  on public.posts for insert
  with check (
    is_circle_member(circle_id)
    and author_id = auth.uid()
  );

create policy "post_author_update"
  on public.posts for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Reactions -------------------------------------------------------------------
-- Read: circle members see all reactions on posts in their circles.
-- Create: circle members only, authored as themselves.
-- Delete: users can remove their own reactions.

create policy "reaction_member_read"
  on public.reactions for select
  using (
    exists (
      select 1 from public.posts
      where posts.id = reactions.post_id
        and is_circle_member(posts.circle_id)
    )
  );

create policy "reaction_self_insert"
  on public.reactions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.posts
      where posts.id = post_id
        and is_circle_member(posts.circle_id)
    )
  );

create policy "reaction_self_delete"
  on public.reactions for delete
  using (user_id = auth.uid());

-- Daily Questions -------------------------------------------------------------
-- Read only. Questions are generated server-side by the AI Curator agent.

create policy "question_member_read"
  on public.daily_questions for select
  using (is_circle_member(circle_id));

-- Question Answers ------------------------------------------------------------
-- Read: circle members.
-- Insert: circle members, authored as self.

create policy "answer_member_read"
  on public.question_answers for select
  using (is_circle_member(circle_id) and deleted_at is null);

create policy "answer_self_insert"
  on public.question_answers for insert
  with check (
    author_id = auth.uid()
    and is_circle_member(circle_id)
  );

create policy "answer_self_update"
  on public.question_answers for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Fallback Questions ----------------------------------------------------------
-- Server-only table. No client access. Managed by admin tooling.
-- (No policies granted; default deny.)

-- Moderation Events -----------------------------------------------------------
-- Server-only. Users never see the moderation audit log.
-- (No policies granted; default deny.)

-- Recaps ----------------------------------------------------------------------
-- Circle members can read their circle's recaps.

create policy "recap_member_read"
  on public.recaps for select
  using (is_circle_member(circle_id));

-- Push Tokens -----------------------------------------------------------------
-- Users manage only their own tokens.

create policy "push_token_self_all"
  on public.push_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Notification Prefs ----------------------------------------------------------
-- Users manage only their own prefs.

create policy "notif_prefs_self_all"
  on public.notification_prefs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
