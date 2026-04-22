// ============================================================================
// palmi: Recap Writer Agent
// Runs: hourly via pg_cron
// Purpose: on the 1st of each month at 09:00 local (per circle owner),
//          write a warm 120-180 word prose recap of the prior month.
//          AI first (Claude Haiku 4.5), template fallback on any failure.
//
// Deploy:
//   supabase functions deploy write-recap --no-verify-jwt
//
// Env vars required:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL                 (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY    (auto-injected)
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
const RUN_HOUR_LOCAL = 9;

// ----------------------------------------------------------------------------
// Prompt — the brand's voice, compressed. Keep edits here surgical.
// ----------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the Recap Writer for palmi, a small-circle social app for close friends (2-15 people). Once a month, you write a short prose recap of the circle's prior month for its members to read together.

## What a good palmi recap sounds like

- Warm, lowercase-friendly, specific, human
- 120-180 words, one flowing paragraph (or two short ones)
- Written like a friend noticing things, not a platform summarizing data
- Mentions members by first name when it's natural — not every member, not a roll call
- Anchors to specific moments when they exist ("the week maya kept posting from the coffee shop", "jordan's long answer about the smell of his grandmother's kitchen")
- The tone varies with the month — sometimes reflective, sometimes playful, sometimes quiet

## Hard rules

- Never therapeutic ("how are you really doing", "hold space", "you showed up for each other")
- Never dramatic ("an incredible month", "unforgettable moments")
- Never generic ("you all had a great month", "lots of fun")
- Never cite metrics: no post counts, no percentages, no "X times", no streak talk
- Never describe photos in detail (just allude if relevant, e.g. "a photo from the walk")
- Never invent specifics. If a detail isn't in the source material, don't include it.
- Never reference palmi, circles, or the app itself

## Output format

Return JSON only, no preamble:
{"recap": "...", "tone": "reflective|playful|quiet"}`;

interface MemberCtx {
  user_id: string;
  first_name: string;
}

interface AnswerCtx {
  author_first: string;
  question: string;
  body: string;
}

interface PostCtx {
  author_first: string;
  body: string;
  had_photo: boolean;
  date: string; // YYYY-MM-DD in owner local tz
}

interface RecapContext {
  circle_name: string;
  period_label: string; // e.g. "March 2026"
  members: MemberCtx[];
  top_questions: string[]; // the month's daily questions
  sample_answers: AnswerCtx[];
  sample_posts: PostCtx[];
}

export function buildUserPrompt(ctx: RecapContext): string {
  const members = ctx.members.map((m) => m.first_name).join(', ');
  const questions = ctx.top_questions.length
    ? ctx.top_questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
    : '  (no daily questions this month)';
  const answers = ctx.sample_answers.length
    ? ctx.sample_answers
        .map((a) => `  - ${a.author_first} (to "${a.question}"): ${a.body}`)
        .join('\n')
    : '  (no answers)';
  const posts = ctx.sample_posts.length
    ? ctx.sample_posts
        .map(
          (p) =>
            `  - ${p.author_first} on ${p.date}${p.had_photo ? ' [with photo]' : ''}: ${p.body || '(photo only)'}`
        )
        .join('\n')
    : '  (no posts)';

  return `Write the recap for this circle's prior month.

Circle: "${ctx.circle_name}"
Period: ${ctx.period_label}
Members (first names): ${members}

Daily questions the circle answered this month:
${questions}

Selected answers from the month:
${answers}

Selected posts from the month:
${posts}

Write 120-180 words. Mention at least one member by first name. Anchor to a specific moment if one stands out. Match the tone to what the material actually sounds like — don't force warmth. Return the JSON object now.`;
}

// ----------------------------------------------------------------------------
// Quality gates
// ----------------------------------------------------------------------------
export interface ValidateOk {
  ok: true;
  recap: string;
  tone: 'reflective' | 'playful' | 'quiet';
}
export interface ValidateFail {
  ok: false;
  reason: string;
}
export type ValidateResult = ValidateOk | ValidateFail;

export function validateRecap(raw: string, memberFirstNames: string[]): ValidateResult {
  let parsed: any;
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, reason: 'not_valid_json' };
  }

  const recap = typeof parsed.recap === 'string' ? parsed.recap.trim() : '';
  const toneRaw = typeof parsed.tone === 'string' ? parsed.tone.trim() : '';

  if (!recap) return { ok: false, reason: 'empty_recap' };
  if (recap.length < 500) return { ok: false, reason: 'too_short' };
  if (recap.length > 1500) return { ok: false, reason: 'too_long' };

  // Forbidden terms — brand/safety. Superset of the curator's list.
  const forbidden: RegExp[] = [
    /\bpalmi\b/i,
    /\bthe app\b/i,
    /\bthis app\b/i,
    /\bthe platform\b/i,
    /\bstreak\b/i,
    /\bhold(?:ing)? space\b/i,
    /\bshow(?:ed|ing)? up for each other\b/i,
    /\bhow are you really\b/i,
    /\bunforgettable\b/i,
    /\bincredible month\b/i,
    /\bgreat month\b/i,
    /\blots of fun\b/i,
    /\bphotograph of\b/i,
    /\bin the picture\b/i,
    /\bthe photo shows\b/i,
  ];
  for (const pat of forbidden) {
    if (pat.test(recap)) return { ok: false, reason: `forbidden:${pat.source}` };
  }

  // No metrics. Watch for numbers paired with units we don't show users.
  const metricPatterns: RegExp[] = [
    /\b\d+\s*%/,
    /\b\d+\s*(?:posts?|photos?|reactions?|answers?|messages?|replies?|times|members?|days?\s+in\s+a\s+row)\b/i,
    /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:post|reaction|answer)\b/i,
  ];
  for (const pat of metricPatterns) {
    if (pat.test(recap)) return { ok: false, reason: `metric:${pat.source}` };
  }

  // Must mention at least one member first name (whole-word, case-insensitive).
  const mentioned = memberFirstNames.some((name) => {
    if (!name) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(recap);
  });
  if (!mentioned) return { ok: false, reason: 'no_member_mentioned' };

  const validTones = ['reflective', 'playful', 'quiet'] as const;
  const tone = (validTones as readonly string[]).includes(toneRaw)
    ? (toneRaw as ValidateOk['tone'])
    : 'reflective';

  return { ok: true, recap, tone };
}

// ----------------------------------------------------------------------------
// Fallback template. Rotates a small set of sentence skeletons and slots in
// member names. Never mentions metrics or photos. Always >= 500 chars.
// ----------------------------------------------------------------------------
export function templateRecap(
  periodLabel: string,
  memberFirstNames: string[]
): { recap: string; tone: 'quiet' } {
  const names = memberFirstNames.filter(Boolean);
  const namesJoined = joinNames(names);
  const primary = names[0] ?? 'everyone';
  const secondary = names[1] ?? primary;

  const recap =
    `${periodLabel.toLowerCase()} had its own shape. ` +
    `${namesJoined} kept the rhythm going in small ways — little notes, a question answered on a tuesday morning, ` +
    `a thought shared before bed. nothing loud, nothing that asked for attention. ` +
    `${primary} was around in a quiet, steady way, the kind of presence that feels like overhearing a conversation you weren't supposed to join — in the best way. ` +
    `${secondary} was there too, threading through the weeks, ` +
    `the kind of company you only notice when you look back. ` +
    `the month didn't do anything dramatic. it didn't need to. ` +
    `it just kept its shape, the way this group has quietly gotten good at. ` +
    `here's to the next one, whatever form it takes.`;

  return { recap, tone: 'quiet' };
}

function joinNames(names: string[]): string {
  if (names.length === 0) return 'the group';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// ----------------------------------------------------------------------------
// Anthropic call
// ----------------------------------------------------------------------------
async function generateRecap(
  ctx: RecapContext
): Promise<{ recap: string; tone: ValidateOk['tone'] } | null> {
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
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(ctx) }],
        temperature: 0.9,
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

    const names = ctx.members.map((m) => m.first_name);
    const result = validateRecap(text, names);
    if (!result.ok) {
      console.warn(`validation_failed reason=${result.reason} raw=${text}`);
      return null;
    }

    return { recap: result.recap, tone: result.tone };
  } catch (err) {
    console.error('generate_error', err);
    return null;
  }
}

// ----------------------------------------------------------------------------
// Timezone helpers
// ----------------------------------------------------------------------------
export function localPartsInTz(
  timezone: string,
  now: Date = new Date()
): { hour: number; day: number; year: number; month: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      day: 'numeric',
      year: 'numeric',
      month: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const hour = parseInt(get('hour') ?? '', 10);
    const day = parseInt(get('day') ?? '', 10);
    const year = parseInt(get('year') ?? '', 10);
    const month = parseInt(get('month') ?? '', 10);
    if ([hour, day, year, month].some((n) => Number.isNaN(n))) return null;
    return { hour, day, year, month };
  } catch {
    return null;
  }
}

export function shouldRunForCircle(timezone: string, now: Date = new Date()): boolean {
  const parts = localPartsInTz(timezone, now);
  if (!parts) return false;
  return parts.hour === RUN_HOUR_LOCAL && parts.day === 1;
}

// Given "today is the 1st of month M in tz", compute the prior month's
// [start, end] as YYYY-MM-DD strings and a human label like "March 2026".
export function priorMonthPeriod(
  timezone: string,
  now: Date = new Date()
): { start: string; end: string; label: string } | null {
  const parts = localPartsInTz(timezone, now);
  if (!parts) return null;
  let year = parts.year;
  let month = parts.month - 1; // prior month
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${year}-${mm}-01`;
  const end = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return { start, end, label };
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

// ----------------------------------------------------------------------------
// Main handler
// ----------------------------------------------------------------------------
serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: circles, error } = await supa
    .from('circles')
    .select('id, name, created_at, member_count')
    .is('deleted_at', null)
    .gt('member_count', 0);

  if (error) {
    console.error('fetch_circles_error', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const stats = { checked: 0, written: 0, ai: 0, template: 0, skipped: 0, errors: 0 };
  const now = new Date();

  for (const circle of circles ?? []) {
    stats.checked++;

    const { data: ownerMembership } = await supa
      .from('memberships')
      .select('user_id')
      .eq('circle_id', circle.id)
      .eq('role', 'owner')
      .is('left_at', null)
      .maybeSingle();

    const ownerId = ownerMembership?.user_id;
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
    if (!shouldRunForCircle(tz, now)) {
      stats.skipped++;
      continue;
    }

    const period = priorMonthPeriod(tz, now);
    if (!period) {
      stats.skipped++;
      continue;
    }

    const { data: existing } = await supa
      .from('recaps')
      .select('id')
      .eq('circle_id', circle.id)
      .eq('period_start', period.start)
      .maybeSingle();

    if (existing) {
      stats.skipped++;
      continue;
    }

    // Gather context ---------------------------------------------------------
    const periodStartIso = `${period.start}T00:00:00Z`;
    const periodEndIso = `${period.end}T23:59:59Z`;

    const [membersRes, questionsRes, answersRes, postsRes] = await Promise.all([
      supa
        .from('memberships')
        .select('user_id, profiles:profiles!inner(display_name)')
        .eq('circle_id', circle.id)
        .is('left_at', null),
      supa
        .from('daily_questions')
        .select('id, question_text, drops_on')
        .eq('circle_id', circle.id)
        .gte('drops_on', period.start)
        .lte('drops_on', period.end)
        .order('drops_on', { ascending: true }),
      supa
        .from('question_answers')
        .select('body, created_at, author_id, question_id')
        .eq('circle_id', circle.id)
        .is('deleted_at', null)
        .gte('created_at', periodStartIso)
        .lte('created_at', periodEndIso)
        .not('body', 'is', null)
        .order('created_at', { ascending: true }),
      supa
        .from('posts')
        .select('body, photo_url, author_id, created_at')
        .eq('circle_id', circle.id)
        .is('deleted_at', null)
        .gte('created_at', periodStartIso)
        .lte('created_at', periodEndIso)
        .order('created_at', { ascending: true }),
    ]);

    const members: MemberCtx[] = (membersRes.data ?? []).map((m: any) => ({
      user_id: m.user_id,
      first_name: firstName(m.profiles?.display_name ?? ''),
    }));
    const nameById = new Map(members.map((m) => [m.user_id, m.first_name]));

    const questions = (questionsRes.data ?? []) as { id: string; question_text: string }[];
    const questionTextById = new Map(questions.map((q) => [q.id, q.question_text]));

    // Pick up to 8 answers — prefer the longest ones (more signal)
    const sampleAnswers: AnswerCtx[] = (answersRes.data ?? [])
      .map((a: any) => ({
        author_first: nameById.get(a.author_id) ?? 'someone',
        question: questionTextById.get(a.question_id) ?? '',
        body: (a.body as string).trim(),
      }))
      .filter((a) => a.body.length > 0 && a.question)
      .sort((a, b) => b.body.length - a.body.length)
      .slice(0, 8);

    const samplePosts: PostCtx[] = (postsRes.data ?? [])
      .map((p: any) => ({
        author_first: nameById.get(p.author_id) ?? 'someone',
        body: (p.body ?? '').trim(),
        had_photo: !!p.photo_url,
        date: (p.created_at as string).slice(0, 10),
      }))
      .slice(0, 10);

    const ctx: RecapContext = {
      circle_name: circle.name,
      period_label: period.label,
      members,
      top_questions: questions.map((q) => q.question_text),
      sample_answers: sampleAnswers,
      sample_posts: samplePosts,
    };

    // Generate ---------------------------------------------------------------
    let body: string;
    let source: 'ai' | 'template';

    const ai = await generateRecap(ctx);
    if (ai) {
      body = ai.recap;
      source = 'ai';
      stats.ai++;
    } else {
      const tpl = templateRecap(
        period.label,
        members.map((m) => m.first_name)
      );
      body = tpl.recap;
      source = 'template';
      stats.template++;
    }

    const { error: insertErr } = await supa.from('recaps').insert({
      circle_id: circle.id,
      period_start: period.start,
      period_end: period.end,
      body,
      source,
    });

    if (insertErr) {
      console.error(`insert_error circle=${circle.id}`, insertErr);
      stats.errors++;
      continue;
    }

    stats.written++;
  }

  return new Response(JSON.stringify(stats), {
    headers: { 'content-type': 'application/json' },
  });
});
