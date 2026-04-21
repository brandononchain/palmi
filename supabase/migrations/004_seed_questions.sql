-- ============================================================================
-- palmi: fallback question bank seed
-- Migration 004: ~80 curated questions for when AI output fails
-- ============================================================================
--
-- Categories by tag:
--   sensory    - what's around you right now
--   memory     - small past moments
--   playful    - light, funny
--   reflective - quiet observations
--   specific   - weirdly precise (the best kind)
--   sharing    - prompts a photo naturally
--
-- Style rules for additions:
--   - Under 100 characters
--   - Answerable in 30 seconds
--   - No "what's your favorite" (too broad)
--   - No "rate your day 1-10" (too quantified)
--   - Must work for a 19-year-old college student
-- ============================================================================

insert into public.fallback_questions (question_text, tags) values
  -- Sensory (what's right here, right now)
  ('What''s within arm''s reach of you right now?', '{sensory,sharing}'),
  ('What does the ceiling above you look like?', '{sensory,specific}'),
  ('What''s the last thing you ate and was it a good decision?', '{sensory,playful}'),
  ('Show us what''s on your phone''s lock screen.', '{sensory,sharing}'),
  ('What''s the loudest sound you can hear right now?', '{sensory}'),
  ('What''s the oldest thing in the room with you?', '{sensory,specific}'),
  ('First thing you touched this morning that wasn''t your phone?', '{sensory,reflective}'),
  ('What''s on the floor near you? (real answer)', '{sensory,playful}'),
  ('Post a photo of the window closest to you.', '{sensory,sharing}'),
  ('What''s the last thing you drank out of?', '{sensory,sharing}'),

  -- Memory (small past moments)
  ('What made you laugh yesterday?', '{memory}'),
  ('Last text message you sent that wasn''t to someone in this circle?', '{memory,playful}'),
  ('What was the last song that got stuck in your head?', '{memory}'),
  ('Something small you did this week that you''re quietly proud of?', '{memory,reflective}'),
  ('Last thing you googled? (be honest)', '{memory,playful}'),
  ('A compliment someone gave you recently that stuck?', '{memory,reflective}'),
  ('Weirdest thing you overheard this week?', '{memory,playful}'),
  ('What''s the last thing that made you actually lol?', '{memory,playful}'),
  ('A photo you took this week and haven''t shown anyone?', '{memory,sharing}'),
  ('What was the highlight of your Sunday?', '{memory}'),

  -- Reflective (quiet observations)
  ('What''s something you''re looking forward to, even if small?', '{reflective}'),
  ('What''s something you used to love that you don''t anymore?', '{reflective}'),
  ('What''s a smell that you associate with home?', '{reflective,memory}'),
  ('When did you last feel like time slowed down?', '{reflective}'),
  ('A place you''ve been thinking about going back to?', '{reflective}'),
  ('What''s something your younger self would be surprised you''re doing now?', '{reflective}'),
  ('What would you do with an hour completely to yourself today?', '{reflective}'),
  ('A small thing that made today feel okay?', '{reflective}'),
  ('What''s a sentence you keep thinking about?', '{reflective}'),

  -- Playful
  ('If your week had a theme song, what would it be?', '{playful}'),
  ('What''s an unhinged opinion you hold?', '{playful}'),
  ('Describe your day using only one emoji. No explanation.', '{playful,specific}'),
  ('What would you title this current chapter of your life?', '{playful,reflective}'),
  ('Most embarrassing recent typo?', '{playful,memory}'),
  ('What''s a food combination you love that others think is weird?', '{playful}'),
  ('Post the most recent selfie in your camera roll, no edits.', '{playful,sharing}'),
  ('What''s a skill you pretend to have but don''t actually?', '{playful}'),
  ('Most dramatic thing that happened to you this week?', '{playful,memory}'),
  ('If you could ban one fashion trend, what would it be?', '{playful}'),

  -- Specific (weirdly precise)
  ('What did you eat for breakfast and rate it honestly 1-5.', '{specific,sensory}'),
  ('Screenshot the 3rd-to-last photo in your camera roll.', '{specific,sharing}'),
  ('What song was playing the last time you drove somewhere?', '{specific,memory}'),
  ('Open your Notes app. What''s the most recent note?', '{specific,sharing}'),
  ('What''s the last thing you wrote down on paper?', '{specific,sensory}'),
  ('Show us your most-used emoji from the past month.', '{specific,sharing}'),
  ('What time did you wake up today? Was it a choice?', '{specific,playful}'),
  ('How many tabs do you have open right now? Show us.', '{specific,sharing}'),
  ('What''s the last thing you bought that cost under $10?', '{specific,memory}'),
  ('What shoes are you wearing (or not wearing)?', '{specific,sensory}'),

  -- Sharing (prompts a photo naturally)
  ('What''s on your desk right now?', '{sharing,sensory}'),
  ('Post a photo from a walk you took this week.', '{sharing,memory}'),
  ('Show us the last meal you made yourself.', '{sharing,memory}'),
  ('What''s the view from where you''re sitting?', '{sharing,sensory}'),
  ('Post a picture of the sky today.', '{sharing,sensory}'),
  ('Your most recent screenshot, no context needed.', '{sharing,specific}'),
  ('Show us something in your space that means something to you.', '{sharing,reflective}'),
  ('Post a photo of something you''re reading, watching, or listening to.', '{sharing}'),
  ('What''s on your floor that shouldn''t be?', '{sharing,playful}'),
  ('Show us the contents of your bag or backpack.', '{sharing,specific}'),

  -- Morning drops (generic-friendly)
  ('Good morning — what''s the first thing you noticed today?', '{reflective,sensory}'),
  ('Coffee, tea, or something else today?', '{playful,sensory}'),
  ('What did you dream about, if you remember?', '{reflective,memory}'),

  -- Evening drops
  ('What''s one thing from today you want to remember?', '{reflective}'),
  ('What''s playing in the background of your night?', '{sensory,sharing}'),
  ('How are you, actually?', '{reflective}'),
  ('What are you doing right this second?', '{sensory,sharing}'),

  -- Group dynamics (when circle activity is low)
  ('Who in this circle did you talk to most recently outside this app?', '{playful,memory}'),
  ('What''s an inside joke this circle has that nobody else gets?', '{memory,playful}'),
  ('Where should this circle go together if we could?', '{reflective,playful}'),
  ('Most underrated member of this circle, and why?', '{playful}'),

  -- Seasonal-agnostic fallbacks
  ('What''s your relationship with today''s weather?', '{playful,sensory}'),
  ('Describe the last 24 hours in one word.', '{reflective,specific}'),
  ('What''s something you''re quietly optimistic about?', '{reflective}'),
  ('The thing you keep putting off — will today be the day?', '{playful,reflective}'),

  -- Zero-pressure / opt-out friendly
  ('No pressure to answer — but what''s been on your mind?', '{reflective}'),
  ('Even just say hi. That counts.', '{reflective}'),
  ('Post a photo, any photo. We''re not picky.', '{sharing,playful}');
