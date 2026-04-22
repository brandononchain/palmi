-- ============================================================================
-- palmi: moderation
-- Migration 007: per-content moderation_status + held-content visibility
-- ============================================================================
--
-- The Moderator agent (Edge Function: moderate-content) runs synchronously on
-- every post and question_answer INSERT. Verdicts:
--
--   pass   -> row inserted with moderation_status = 'ok'   (visible to circle)
--   hold   -> row inserted with moderation_status = 'held' (visible only to author)
--   reject -> no row inserted; event logged with content_id = null
--
-- Rejects don't produce a content row, so moderation_events.content_id must
-- be nullable.
-- ============================================================================

-- Per-content moderation status ----------------------------------------------
alter table public.posts
  add column moderation_status text not null default 'ok'
    check (moderation_status in ('ok', 'held'));

alter table public.question_answers
  add column moderation_status text not null default 'ok'
    check (moderation_status in ('ok', 'held'));

create index idx_posts_moderation_held
  on public.posts(circle_id, author_id)
  where moderation_status = 'held' and deleted_at is null;

create index idx_answers_moderation_held
  on public.question_answers(circle_id, author_id)
  where moderation_status = 'held' and deleted_at is null;

-- moderation_events: content_id nullable --------------------------------------
-- Rejects never produce a content row, so we still need to audit the call.
alter table public.moderation_events
  alter column content_id drop not null;

alter table public.moderation_events
  add column if not exists reason text;

-- RLS: held content is visible only to its author -----------------------------
-- The rest of the circle sees nothing until an (eventual) human-review path
-- flips the status back to 'ok'. Authors can always see their own held items
-- so the UI can display a gentle "under review" state.
drop policy if exists "post_member_read" on public.posts;
create policy "post_member_read"
  on public.posts for select
  using (
    is_circle_member(circle_id)
    and deleted_at is null
    and (moderation_status = 'ok' or author_id = auth.uid())
  );

drop policy if exists "answer_member_read" on public.question_answers;
create policy "answer_member_read"
  on public.question_answers for select
  using (
    is_circle_member(circle_id)
    and deleted_at is null
    and (moderation_status = 'ok' or author_id = auth.uid())
  );
