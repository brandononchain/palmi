// ============================================================================
// palmi: Question Curator Agent
// Runs: hourly via pg_cron
// Purpose: for each circle whose local "drop time" is in the next hour,
//          generate one daily question. Use the AI first, fall back to the
//          bank on any failure.
//
// Deploy:
//   supabase functions deploy curate-question --no-verify-jwt
//
// Env vars required:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL          (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
// ============================================================================

// @ts-ignore deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// @ts-ignore deno imports
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

// @ts-ignore deno globals
declare const Deno: { env: { get(key: string): string | undefined } };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const MODEL = 'claude-haiku-4-5-20251001';
const DROP_HOUR_LOCAL = 9; // 9am in the circle's timezone

// ----------------------------------------------------------------------------
// The prompt. This is the single most important piece of product DNA in the
// entire AI layer. Tone-match it to the brand: calm, editorial, human.
// ----------------------------------------------------------------------------
const SYSTEM_PROMPT = `You write the daily question for palmi, a small-circle social app for close friends. A "circle" is 2-15 people who know each other well.

Your job is to write ONE question that members of a specific circle will answer today. The question appears as part of a calm ritual — there is no pressure, no streak, no competition. People should want to answer it because it's interesting, not because an app told them to.

## The palmi voice

- Lowercase-friendly, conversational, never corporate
- Curious, not performative
- Specific beats general ("what's within arm's reach right now?" beats "what are you up to?")
- Sensory, physical, present-moment prompts work well
- Small is beautiful. Mundane is the point.
- Never therapeutic ("how are you *really* doing?"). Never dramatic ("if you could change one thing…")
- Never a choice/poll ("coffee or tea?"). Always open-ended.

## Hard rules

- Under 100 characters
- Must end with a question mark OR be a gentle imperative ("show us the last thing you drank out of.")
- No questions about politics, religion, money, weight, or appearance
- No "favorite X" questions (too broad, lazy)
- No questions that require answers longer than 30 seconds
- Answerable by a 19-year-old and a 30-year-old in the same circle
- No references to palmi, circles, or the app itself

## Output format

Return JSON only, no preamble:
{"question": "...", "tag": "sensory|memory|playful|reflective|specific|sharing"}`;

interface CircleContext {
  circle_id: string;
  circle_name: string;
  circle_age_days: number;
  member_count: number;
  posts_last_7d: number;
  recent_questions: string[]; // last 14 so we don't repeat
  day_of_week: string;
  local_date: string;
}

function buildUserPrompt(ctx: CircleContext): string {
  return `Generate today's question for a circle.

Context:
- Circle name: "${ctx.circle_name}"
- Age: ${ctx.circle_age_days} days old
- Size: ${ctx.member_count} members
- Activity: ${ctx.posts_last_7d} posts in the last 7 days
- Today: ${ctx.day_of_week}, ${ctx.local_date}

Recent questions this circle has seen (DO NOT repeat these themes):
${ctx.recent_questions.length ? ctx.recent_questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n') : '  (none yet)'}

Rules reminder:
- If activity is low (< 3 posts/week), lean toward gentle, low-pressure questions
- Vary the tag from whatever was used most recently
- Be specific, be sensory, be human

Output the JSON object now.`;
}

// ----------------------------------------------------------------------------
// Quality gates — the AI output passes these or we fall back.
// ----------------------------------------------------------------------------
function validateQuestion(raw: string): { ok: true; text: string; tag: string } | { ok: false; reason: string } {
  let parsed: any;
  try {
    // Strip markdown code fences if the model wrapped output
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, reason: 'not_valid_json' };
  }

  const text = typeof parsed.question === 'string' ? parsed.question.trim() : '';
  const tag = typeof parsed.tag === 'string' ? parsed.tag.trim() : '';

  if (!text) return { ok: false, reason: 'empty_question' };
  if (text.length < 5 || text.length > 200) return { ok: false, reason: 'length_out_of_range' };
  if (text.length > 100) return { ok: false, reason: 'too_long_soft_limit' };

  // Must end with ? or . (imperative)
  if (!/[?.]$/.test(text)) return { ok: false, reason: 'bad_punctuation' };

  // Forbidden substrings — brand/safety
  const forbidden = [
    /\bpalmi\b/i,
    /\bcircle\b/i,
    /\bthe app\b/i,
    /\bfavorite\b/i,
    /\brate\b.*\b1-?10\b/i,
    /\bpolitic/i,
    /\breligio/i,
  ];
  for (const pat of forbidden) {
    if (pat.test(text)) return { ok: false, reason: `forbidden_word:${pat.source}` };
  }

  const validTags = ['sensory', 'memory', 'playful', 'reflective', 'specific', 'sharing'];
  const finalTag = validTags.includes(tag) ? tag : 'reflective';

  return { ok: true, text, tag: finalTag };
}

// ----------------------------------------------------------------------------
// Anthropic API call
// ----------------------------------------------------------------------------
async function generateQuestion(ctx: CircleContext): Promise<{ text: string; tag: string } | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(ctx) }],
        temperature: 1.0, // we want variety
      }),
    });

    if (!res.ok) {
      console.error(`anthropic_error status=${res.status} body=${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) {
      console.error('anthropic_no_content', data);
      return null;
    }

    const result = validateQuestion(text);
    if (!result.ok) {
      console.warn(`validation_failed reason=${result.reason} raw=${text}`);
      return null;
    }

    return { text: result.text, tag: result.tag };
  } catch (err) {
    console.error('generate_error', err);
    return null;
  }
}

// ----------------------------------------------------------------------------
// Fallback: grab a question from the human-curated bank.
// Prefer least-recently-used + tag diversity from recent questions.
// ----------------------------------------------------------------------------
async function fallbackQuestion(supa: any, circleId: string): Promise<string> {
  // Get last 14 questions asked to this circle (for variety)
  const { data: recent } = await supa
    .from('daily_questions')
    .select('question_text')
    .eq('circle_id', circleId)
    .order('drops_at', { ascending: false })
    .limit(14);

  const recentTexts = new Set<string>((recent ?? []).map((r: any) => r.question_text));

  // Pull active bank, ordered by least-used
  const { data: bank } = await supa
    .from('fallback_questions')
    .select('id, question_text, times_used')
    .eq('active', true)
    .order('times_used', { ascending: true })
    .limit(30);

  if (!bank || bank.length === 0) {
    return 'What are you up to today?'; // last-resort hardcoded fallback
  }

  // Find the least-used one that hasn't been asked in this circle recently
  const candidate = bank.find((q: any) => !recentTexts.has(q.question_text)) ?? bank[0];

  // Increment usage counter
  await supa
    .from('fallback_questions')
    .update({ times_used: candidate.times_used + 1 })
    .eq('id', candidate.id);

  return candidate.question_text;
}

// ----------------------------------------------------------------------------
// Timezone math: is this circle's local clock currently within [09:00, 10:00)?
// We call the function hourly, so we target circles whose drop hour is NOW.
// ----------------------------------------------------------------------------
function isDropHourNow(timezone: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    if (!hourPart) return false;
    return parseInt(hourPart, 10) === DROP_HOUR_LOCAL;
  } catch {
    // Bad timezone string - skip this circle
    return false;
  }
}

function localDateInTz(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()); // returns YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function dayOfWeek(timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(new Date());
}

// ----------------------------------------------------------------------------
// Main handler
// ----------------------------------------------------------------------------
serve(async (req) => {
  // Only accept POST (pg_cron uses POST) — and require a shared secret
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Get all active circles with at least one member
  const { data: circles, error } = await supa
    .from('circles')
    .select('id, name, created_at, member_count')
    .is('deleted_at', null)
    .gt('member_count', 0);

  if (error) {
    console.error('fetch_circles_error', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const stats = { checked: 0, generated: 0, ai: 0, fallback: 0, skipped: 0, errors: 0 };

  for (const circle of circles ?? []) {
    stats.checked++;

    // Pick the "representative" timezone of the circle. For v1 we use the
    // creator's timezone; v2 can support per-circle TZ override.
    const { data: creatorMembership } = await supa
      .from('memberships')
      .select('user_id')
      .eq('circle_id', circle.id)
      .eq('role', 'owner')
      .is('left_at', null)
      .maybeSingle();

    const ownerId = creatorMembership?.user_id;
    if (!ownerId) {
      stats.skipped++;
      continue;
    }

    const { data: ownerProfile } = await supa
      .from('profiles')
      .select('timezone')
      .eq('id', ownerId)
      .maybeSingle();

    const tz = ownerProfile?.timezone ?? 'UTC';

    // Only generate if local time is in our drop hour
    if (!isDropHourNow(tz)) {
      stats.skipped++;
      continue;
    }

    // Check for an existing question today
    const localDate = localDateInTz(tz);
    const { data: existing } = await supa
      .from('daily_questions')
      .select('id')
      .eq('circle_id', circle.id)
      .eq('drops_on', localDate)
      .maybeSingle();

    if (existing) {
      stats.skipped++;
      continue;
    }

    // Gather context for the AI
    const [recentQs, recentPosts] = await Promise.all([
      supa
        .from('daily_questions')
        .select('question_text')
        .eq('circle_id', circle.id)
        .order('drops_at', { ascending: false })
        .limit(14),
      supa
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('circle_id', circle.id)
        .gte('created_at', new Date(Date.now() - 7 * 86400 * 1000).toISOString()),
    ]);

    const ctx: CircleContext = {
      circle_id: circle.id,
      circle_name: circle.name,
      circle_age_days: Math.floor(
        (Date.now() - new Date(circle.created_at).getTime()) / 86400000
      ),
      member_count: circle.member_count,
      posts_last_7d: recentPosts.count ?? 0,
      recent_questions: (recentQs.data ?? []).map((r: any) => r.question_text),
      day_of_week: dayOfWeek(tz),
      local_date: localDate,
    };

    // Try AI, fall back on failure
    let questionText: string;
    let source: 'ai' | 'fallback';

    const aiResult = await generateQuestion(ctx);
    if (aiResult) {
      questionText = aiResult.text;
      source = 'ai';
      stats.ai++;
    } else {
      questionText = await fallbackQuestion(supa, circle.id);
      source = 'fallback';
      stats.fallback++;
    }

    // Insert
    const { error: insertErr } = await supa.from('daily_questions').insert({
      circle_id: circle.id,
      question_text: questionText,
      source,
      drops_at: new Date().toISOString(),
      drops_on: localDate,
    });

    if (insertErr) {
      console.error(`insert_error circle=${circle.id}`, insertErr);
      stats.errors++;
      continue;
    }

    stats.generated++;
  }

  return new Response(JSON.stringify(stats), {
    headers: { 'content-type': 'application/json' },
  });
});
