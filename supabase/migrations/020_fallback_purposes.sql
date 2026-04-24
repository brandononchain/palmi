-- ============================================================================
-- palmi: per-purpose fallback bank (Phase 1.6)
-- Migration 020: tag every fallback question with which circle purpose(s)
-- it works for, and seed ~30 questions per non-friends purpose so the
-- adaptive curator's fallback path stays in-character.
-- ============================================================================
--
-- Curator selection order (see curate-question fallback path):
--   1. active questions whose purpose array contains the circle's purpose
--   2. otherwise, the broader friends/mixed pool
--   3. otherwise, the hardcoded last-resort string
--
-- 'mixed' = works for any circle. 'friends' = was the original v1 bank.
-- ============================================================================

alter table public.fallback_questions
  add column if not exists purpose text[] not null default '{}';

create index if not exists fallback_questions_purpose_gin
  on public.fallback_questions using gin (purpose);

-- Backfill: every existing seed question is friends + mixed -------------------
update public.fallback_questions
   set purpose = array['friends', 'mixed']
 where purpose = '{}';

-- ============================================================================
-- Seed: study circles
-- Tone = learning cadence, motivation, low-pressure accountability.
-- ============================================================================
insert into public.fallback_questions (question_text, tags, purpose) values
  ('What''s one thing that clicked for you this week?', '{reflective}', '{study}'),
  ('What''s the next small thing you want to learn?', '{reflective}', '{study}'),
  ('Where did you get stuck today?', '{reflective}', '{study}'),
  ('What''s a topic you''re avoiding and why?', '{reflective}', '{study}'),
  ('Show us your study setup right now.', '{sensory,sharing}', '{study}'),
  ('What''s one thing you understood today that confused you yesterday?', '{reflective}', '{study}'),
  ('What''s the smallest amount of progress that still counted today?', '{reflective}', '{study}'),
  ('What did you reread this week?', '{specific}', '{study}'),
  ('What''s a concept you''d explain to a friend over coffee right now?', '{reflective}', '{study}'),
  ('A question you couldn''t answer today?', '{reflective}', '{study}'),
  ('What did you write down today?', '{specific}', '{study}'),
  ('Pomodoros done today (and how it actually felt)?', '{specific}', '{study}'),
  ('A line from your notes that surprised you?', '{specific,sharing}', '{study}'),
  ('Where are you studying from right now?', '{sensory,sharing}', '{study}'),
  ('What''s the easiest win you''ll go for tomorrow?', '{reflective}', '{study}'),
  ('What''s a worked example you keep coming back to?', '{specific}', '{study}'),
  ('What did office hours teach you this week?', '{reflective}', '{study}'),
  ('A practice problem that humbled you?', '{playful,specific}', '{study}'),
  ('What''s a tab you''ve had open for too long?', '{playful,specific}', '{study}'),
  ('If you had 25 quiet minutes right now, what would you study?', '{reflective}', '{study}'),
  ('Most useful thing you read this week (one line is fine)?', '{reflective}', '{study}'),
  ('A formula or definition you finally remembered without checking?', '{specific}', '{study}'),
  ('What broke your focus today and what brought it back?', '{reflective}', '{study}'),
  ('Drop the title of the chapter you''re on.', '{specific,sharing}', '{study}'),
  ('A diagram or sketch you made this week?', '{sharing}', '{study}'),
  ('What''s your tiniest goal for today?', '{reflective}', '{study}'),
  ('What did you teach someone else this week?', '{reflective}', '{study}'),
  ('A study habit you''re testing right now?', '{reflective}', '{study}'),
  ('Where in the material do you feel solid right now?', '{reflective}', '{study}'),
  ('What flashcard deck or notebook are you using today?', '{specific,sharing}', '{study}'),
  ('Pick one mistake from this week worth keeping.', '{reflective}', '{study}');

-- ============================================================================
-- Seed: professional circles
-- Tone = decisions, signal-sharing, conviction. No salary / no confidentiality.
-- ============================================================================
insert into public.fallback_questions (question_text, tags, purpose) values
  ('What''s a small bet you made this week?', '{reflective}', '{professional}'),
  ('Something you changed your mind about?', '{reflective}', '{professional}'),
  ('A question you keep coming back to?', '{reflective}', '{professional}'),
  ('What''s the smallest decision you''re putting off?', '{reflective}', '{professional}'),
  ('A signal you noticed this week that others might have missed?', '{reflective}', '{professional}'),
  ('What did you cut from your week that you''re glad you cut?', '{reflective}', '{professional}'),
  ('A conversation that changed how you''re thinking?', '{reflective}', '{professional}'),
  ('What did you ship or send this week (any size)?', '{specific,sharing}', '{professional}'),
  ('A constraint you''re grateful for right now?', '{reflective}', '{professional}'),
  ('What''s on the top of your tomorrow?', '{specific}', '{professional}'),
  ('Best DM, email, or note you got this week?', '{specific,sharing}', '{professional}'),
  ('A tool, doc, or template you''re newly into?', '{specific,sharing}', '{professional}'),
  ('What''s a small experiment you''ll run next?', '{reflective}', '{professional}'),
  ('What were you wrong about three months ago?', '{reflective}', '{professional}'),
  ('A meeting that was actually worth it this week?', '{reflective}', '{professional}'),
  ('What''s the question you''d ask a smarter version of yourself?', '{reflective}', '{professional}'),
  ('A draft you''re sitting on?', '{specific,sharing}', '{professional}'),
  ('Something you noticed in your craft this week?', '{reflective}', '{professional}'),
  ('What did you say no to this week?', '{reflective}', '{professional}'),
  ('A piece of feedback you''re still chewing on?', '{reflective}', '{professional}'),
  ('What''s a number you''re watching closely (no need to share it)?', '{reflective}', '{professional}'),
  ('Best workspace photo from this week?', '{sharing}', '{professional}'),
  ('A book / essay / talk you''re recommending right now?', '{specific,sharing}', '{professional}'),
  ('What''s underrated in your field this quarter?', '{reflective}', '{professional}'),
  ('A first principle you''ve been returning to?', '{reflective}', '{professional}'),
  ('Something you tried that didn''t work and what you took from it?', '{reflective}', '{professional}'),
  ('A peer or mentor you''re grateful for this week?', '{reflective}', '{professional}'),
  ('What deserves more time on your calendar?', '{reflective}', '{professional}'),
  ('What did your last walk or commute think about?', '{reflective}', '{professional}'),
  ('A question for the group you''d normally sit on?', '{reflective}', '{professional}'),
  ('What''s one thing you''ll try differently next week?', '{reflective}', '{professional}');

-- ============================================================================
-- Seed: interest / hobby circles
-- Tone = anchored in the activity; usable on a quiet week.
-- ============================================================================
insert into public.fallback_questions (question_text, tags, purpose) values
  ('What''s the last thing you noticed that the rest of us would''ve missed?', '{reflective}', '{interest}'),
  ('Show us what you''re working on or watching today.', '{sensory,sharing}', '{interest}'),
  ('A small win from your hobby this week?', '{reflective}', '{interest}'),
  ('Something you learned about your craft this week?', '{reflective}', '{interest}'),
  ('What''s a rabbit hole you went down recently?', '{reflective}', '{interest}'),
  ('A creator, account, or channel worth following right now?', '{specific,sharing}', '{interest}'),
  ('A piece of gear or kit you''re newly into?', '{specific,sharing}', '{interest}'),
  ('What''s a question you wish you''d known to ask earlier?', '{reflective}', '{interest}'),
  ('Best find of the week?', '{playful,sharing}', '{interest}'),
  ('A hot take you''re willing to defend?', '{playful}', '{interest}'),
  ('Something you''re curious about this month?', '{reflective}', '{interest}'),
  ('Last thing you saved or bookmarked?', '{specific,sharing}', '{interest}'),
  ('A photo from your last session/practice/visit?', '{sharing}', '{interest}'),
  ('What''s a tiny detail others tend to overlook here?', '{reflective}', '{interest}'),
  ('A skill you want to try this month?', '{reflective}', '{interest}'),
  ('What''s on your wishlist right now?', '{specific}', '{interest}'),
  ('A good first step for someone new to this?', '{reflective}', '{interest}'),
  ('What''s your favorite small ritual around this?', '{reflective}', '{interest}'),
  ('A photo of your setup today?', '{sensory,sharing}', '{interest}'),
  ('Best beginner mistake you made and now love?', '{playful,reflective}', '{interest}'),
  ('What''s a niche term outsiders never get right?', '{playful}', '{interest}'),
  ('Something you used to overrate?', '{reflective}', '{interest}'),
  ('Something you used to underrate?', '{reflective}', '{interest}'),
  ('A piece you keep coming back to?', '{reflective}', '{interest}'),
  ('Where did you go for this today (room, trail, club, screen)?', '{sensory,sharing}', '{interest}'),
  ('A question you''d ask an expert right now?', '{reflective}', '{interest}'),
  ('What did you tinker with this week?', '{reflective}', '{interest}'),
  ('Drop one tip the rest of us would actually use.', '{specific,sharing}', '{interest}'),
  ('What''s an unfinished project staring at you?', '{specific,reflective}', '{interest}'),
  ('A small upgrade that made things better lately?', '{specific}', '{interest}');

-- ============================================================================
-- Seed: wellness circles
-- Tone = small observable behaviors. Strict: no body / weight / numbers / therapy framing.
-- ============================================================================
insert into public.fallback_questions (question_text, tags, purpose) values
  ('What''s one small thing you did for yourself today?', '{reflective}', '{wellness}'),
  ('What did your last walk feel like?', '{sensory,reflective}', '{wellness}'),
  ('Where did you spend a quiet minute today?', '{sensory,reflective}', '{wellness}'),
  ('What''s the next small habit you''re testing?', '{reflective}', '{wellness}'),
  ('Show us what you ate today (any meal).', '{sensory,sharing}', '{wellness}'),
  ('What time did you wake up and how did the morning feel?', '{sensory}', '{wellness}'),
  ('A small moment of rest you protected today?', '{reflective}', '{wellness}'),
  ('What''s your go-to grounding move when things speed up?', '{reflective}', '{wellness}'),
  ('Where did you move your body today (any movement)?', '{sensory,specific}', '{wellness}'),
  ('A song that helped you settle this week?', '{specific,sharing}', '{wellness}'),
  ('What did you drink at breakfast?', '{sensory}', '{wellness}'),
  ('Something you said no to to protect your week?', '{reflective}', '{wellness}'),
  ('What''s a tiny thing that reset your day recently?', '{reflective}', '{wellness}'),
  ('What''s on your nightstand right now?', '{sensory,sharing}', '{wellness}'),
  ('Where did you feel time slow down today?', '{reflective}', '{wellness}'),
  ('What''s one thing you''ll try to do less of this week?', '{reflective}', '{wellness}'),
  ('A walk, stretch, or pause you took today?', '{sensory,reflective}', '{wellness}'),
  ('What''s the kindest thing you said to yourself this week?', '{reflective}', '{wellness}'),
  ('A small ritual that anchors your evening?', '{reflective}', '{wellness}'),
  ('What''s a snack that quietly made today better?', '{sensory,playful}', '{wellness}'),
  ('Where did you go outside today, even briefly?', '{sensory,sharing}', '{wellness}'),
  ('What''s your room temperature right now (and is it right)?', '{sensory,playful}', '{wellness}'),
  ('A texture you noticed today?', '{sensory}', '{wellness}'),
  ('What''s a small win from yesterday you''re carrying into today?', '{reflective}', '{wellness}'),
  ('A breath or pause you remembered to take today?', '{reflective}', '{wellness}'),
  ('What''s one screen you''ll shut earlier tonight?', '{reflective}', '{wellness}'),
  ('Where''s the most peaceful corner of your space?', '{sensory,sharing}', '{wellness}'),
  ('A sound that''s good company right now?', '{sensory,sharing}', '{wellness}'),
  ('What''s the first thing you smelled this morning?', '{sensory}', '{wellness}'),
  ('What''s grounding you today, in one sentence?', '{reflective}', '{wellness}');

-- ============================================================================
-- Seed: creator circles
-- Tone = process and craft, not audience or metrics.
-- ============================================================================
insert into public.fallback_questions (question_text, tags, purpose) values
  ('What''s a tiny thing you made or fixed today?', '{specific,sharing}', '{creator}'),
  ('What did you cut from a draft this week?', '{reflective}', '{creator}'),
  ('The part you keep avoiding?', '{reflective}', '{creator}'),
  ('Show us the messy work-in-progress.', '{sharing}', '{creator}'),
  ('What''s on your reference board right now?', '{sensory,sharing}', '{creator}'),
  ('A constraint that helped you this week?', '{reflective}', '{creator}'),
  ('A tool or material you''re newly enjoying?', '{specific,sharing}', '{creator}'),
  ('Last thing you watched / read / listened to that fed the work?', '{specific,sharing}', '{creator}'),
  ('What''s a small detail you''re proud of?', '{specific,sharing}', '{creator}'),
  ('A piece you scrapped and don''t regret?', '{reflective}', '{creator}'),
  ('What''s open in your draft folder right now?', '{specific}', '{creator}'),
  ('What''s the smallest version of the next thing you want to make?', '{reflective}', '{creator}'),
  ('A craft choice you''re second-guessing?', '{reflective}', '{creator}'),
  ('A process tweak you''re trying this week?', '{reflective}', '{creator}'),
  ('What''s your first move when you sit down to make?', '{reflective}', '{creator}'),
  ('What time of day works best for you lately?', '{reflective}', '{creator}'),
  ('Photo of your workspace right now?', '{sensory,sharing}', '{creator}'),
  ('A title, hook, or opening line you''re sitting on?', '{specific,sharing}', '{creator}'),
  ('What''s the boring part you''re grinding through?', '{reflective}', '{creator}'),
  ('A reference you keep returning to?', '{specific,sharing}', '{creator}'),
  ('What''s a piece of feedback you''re ready to use?', '{reflective}', '{creator}'),
  ('What did you ship at any size this week?', '{specific,sharing}', '{creator}'),
  ('A small risk in the work this week?', '{reflective}', '{creator}'),
  ('What''s the next decision you have to make?', '{reflective}', '{creator}'),
  ('A texture, palette, or sound stuck in your head?', '{sensory,sharing}', '{creator}'),
  ('Best mistake from this week?', '{reflective,playful}', '{creator}'),
  ('What''s the question your work is trying to answer right now?', '{reflective}', '{creator}'),
  ('Drop a frame, line, or clip from the work.', '{sharing}', '{creator}'),
  ('A craft tip for the rest of us?', '{specific,sharing}', '{creator}'),
  ('What''s the smallest finish line for the week?', '{reflective}', '{creator}');

-- ============================================================================
-- Seed: local circles
-- Tone = grounded in shared place; sensory.
-- ============================================================================
insert into public.fallback_questions (question_text, tags, purpose) values
  ('What does it look like outside your window right now?', '{sensory,sharing}', '{local}'),
  ('Best place near you to sit quietly for ten minutes?', '{sensory,sharing}', '{local}'),
  ('Where did you walk past today?', '{sensory}', '{local}'),
  ('A small place worth showing the rest of us?', '{sensory,sharing}', '{local}'),
  ('What''s open late around you tonight?', '{specific}', '{local}'),
  ('Best snack within two blocks?', '{specific,playful,sharing}', '{local}'),
  ('A street, hallway, or trail you keep coming back to?', '{sensory}', '{local}'),
  ('Photo of the sky from where you are.', '{sensory,sharing}', '{local}'),
  ('What''s the loudest sound around you right now?', '{sensory}', '{local}'),
  ('A neighbor / regular / character you''ve noticed?', '{playful,specific}', '{local}'),
  ('Something good happening near you this week?', '{specific,sharing}', '{local}'),
  ('Where would you take a friend visiting for one hour?', '{sharing}', '{local}'),
  ('Best smell you''ve walked through today?', '{sensory}', '{local}'),
  ('A spot to study/work that always works for you?', '{specific,sharing}', '{local}'),
  ('A photo from your usual route?', '{sensory,sharing}', '{local}'),
  ('What''s the weather doing where you are?', '{sensory}', '{local}'),
  ('A view you stop for, even when you''re busy?', '{sensory,sharing}', '{local}'),
  ('The corner store / café / spot you''d miss most?', '{reflective,sharing}', '{local}'),
  ('Show us the closest plant or tree.', '{sensory,sharing}', '{local}'),
  ('A signpost, mural, or sticker that made you smile?', '{playful,sharing}', '{local}'),
  ('What''s the most-used room or seat in your space?', '{sensory}', '{local}'),
  ('A smell that means home to you here?', '{sensory,reflective}', '{local}'),
  ('Where''s the quietest spot you know nearby?', '{sensory,sharing}', '{local}'),
  ('A place you keep meaning to try?', '{reflective}', '{local}'),
  ('Show us a window from where you''re sitting.', '{sensory,sharing}', '{local}'),
  ('Best person-watching spot near you?', '{playful,sharing}', '{local}'),
  ('What''s within a five-minute walk that you''d recommend?', '{specific,sharing}', '{local}'),
  ('A photo of your front door or hallway?', '{sensory,sharing}', '{local}'),
  ('A view at golden hour worth catching?', '{sensory,sharing}', '{local}'),
  ('Something seasonal happening around you right now?', '{sensory,reflective}', '{local}');

comment on column public.fallback_questions.purpose is
  'Phase 1.6: which circle purposes this question is appropriate for. '
  '"mixed" works anywhere. Empty array = unclassified (treated as friends).';
