// ============================================================================
// palmi: Circle Classifier Agent (Phase 1.3)
// Edge Function: classify-circle
// ============================================================================
//
// For a given circle (or batch of unclassified / stale ones), reads recent
// activity and produces a structured circle_profile row plus an embedding
// for the discovery agent (Phase 2) to match against.
//
// Triggers:
//   1. Cron 019 — weekly batch over circles whose classified_at is null or
//      older than 7 days, and whose purpose_locked = false.
//   2. Direct invoke after a circle reaches its first 3 posts/answers
//      (called from the curate-question post-insert path or the client when
//      the third answer lands; for v1 we keep it cron-driven and let the
//      first weekly run pick up new circles).
//   3. Manual: POST { circle_id } from the owner UI ("re-classify").
//
// Request:
//   POST /classify-circle
//   {} | { circle_id?: string, force?: boolean }
//
// Response:
//   200 { processed, classified, skipped, errors, results: [...] }
//
// Notes:
//   - If purpose_locked = true on the circle, we still refresh subtopics /
//     summary / embedding but never overwrite the purpose itself.
//   - On AI failure we leave the existing profile alone (no fallback writes).
// ============================================================================

// @ts-ignore deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// @ts-ignore deno imports
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { callLlm } from '../_shared/llm.ts';
import { callEmbedding, toPgVector } from '../_shared/embeddings.ts';
import { CURATOR_VARIANT_IDS, type CirclePurpose } from '../_shared/curatorVariants.ts';

// @ts-ignore deno globals
declare const Deno: { env: { get(key: string): string | undefined } };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODEL = 'claude-haiku-4-5-20251001';
const STALE_DAYS = 7;
const BATCH_LIMIT = 50;
const MIN_SIGNAL = 3; // need at least this many posts+answers combined

const VALID_PURPOSES: ReadonlySet<string> = new Set(CURATOR_VARIANT_IDS);
const VALID_AUDIENCES = new Set(['campus', 'young_adult', 'professional', 'mixed']);

// ----------------------------------------------------------------------------
// Prompts
// ----------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the circle classifier for palmi, a private small-group app. A "circle" is 2–15 people who share something — friendship, a class, a hobby, a profession, a place.

You are given three things:
  1. The circle's name, member display names, and recent posts / answers (text).
  2. Aggregate engagement signals (counts, ratios, cadence) for the last 14 days.
  3. The recent daily questions the circle has been asked.

Decide what this circle is for, how it behaves, and how healthy it is. Be calm and conservative — if the text signal is weak, default to "friends" / "mixed" and lean on the aggregates for health + rhythm.

## Output schema (JSON only, no preamble)

{
  "purpose":   "friends" | "study" | "professional" | "interest" | "wellness" | "creator" | "local" | "other",
  "audience":  "campus" | "young_adult" | "professional" | "mixed",
  "subtopics": string[],          // 0–5 short tags, lowercase, kebab-case
  "vibe_keywords": string[],      // 0–5 single words for tone hints
  "summary":   string,            // 1–2 sentences, ≤ 280 chars, calm tone
  "health_score": number,         // 0.0–1.0, see scoring notes below
  "activity_pattern": "dormant" | "sparse" | "steady" | "bursty" | "daily"
}

## Scoring notes (health_score)

Combine these signals into a single 0.0–1.0 number:
  - participation_ratio (active_members / members): higher is healthier.
  - posts + answers volume: non-zero helps; extreme volume is neutral.
  - reaction_ratio: presence of reactions = warmth; 0 = cold.
  - avg_response_seconds to daily questions: < 1 day is great, > 3 days is weak.
  - deleted / total ratio: high deletion is a negative signal.

## Activity pattern

  - dormant: < 2 days active in 14.
  - sparse:  2–5 active days, low posts.
  - steady:  6–10 active days, even cadence.
  - bursty:  ≥ 6 active days with obvious clusters (weekends, events).
  - daily:   12+ active days.

## Rules

- Default to "friends" / "mixed" when content is sparse, generic, or social.
- "study" requires explicit study / class / exam / learning content.
- "professional" requires professional context (founders, investors, ops, design) — not just adults talking about their day.
- "wellness" requires fitness / movement / mindfulness / habit content.
- "creator" requires people sharing work-in-progress, craft, builds.
- "local" requires shared physical place beyond the circle existing online.
- "interest" is the catch-all for shared hobbies that don't fit above.
- "other" only if you genuinely can't tell and it doesn't feel like friends.
- Subtopics: concrete nouns only. No "vibes", no "good times".
- Summary: never marketing-y. Never use "community", "amazing", "vibrant".`;

interface EngagementStats {
  days_window: number;
  members: number;
  active_members: number;
  posts: number;
  answers: number;
  reactions: number;
  replies: number;
  mentions: number;
  deleted: number;
  avg_response_seconds: number | null;
  top_reaction_kind: string | null;
  participation_ratio: number | null;
  reaction_ratio: number | null;
  signal_count: number;
}

interface CircleSignals {
  circle_id: string;
  circle_name: string;
  member_names: string[];
  recent_posts: string[];
  recent_answers: string[];
  recent_questions: string[];
  engagement: EngagementStats;
  signal_count: number;
}

function buildUserPrompt(s: CircleSignals): string {
  const e = s.engagement;
  const lines = [
    `Classify this circle.`,
    ``,
    `Name: "${s.circle_name}"`,
    `Members (${s.member_names.length}): ${s.member_names.join(', ')}`,
    ``,
    `Engagement signals (last ${e.days_window} days):`,
    `  members: ${e.members}   active: ${e.active_members}   participation_ratio: ${fmt(e.participation_ratio)}`,
    `  posts: ${e.posts}   answers: ${e.answers}   replies: ${e.replies}   mentions: ${e.mentions}`,
    `  reactions: ${e.reactions}   reaction_ratio: ${fmt(e.reaction_ratio)}   top_reaction: ${e.top_reaction_kind ?? 'n/a'}`,
    `  avg_response_to_daily_q: ${e.avg_response_seconds != null ? `${e.avg_response_seconds}s (${Math.round(e.avg_response_seconds / 3600)}h)` : 'n/a'}`,
    `  deleted: ${e.deleted}   signal_count: ${e.signal_count}`,
    ``,
    `Recent posts (${s.recent_posts.length}):`,
    ...(s.recent_posts.length
      ? s.recent_posts.map((p, i) => `  ${i + 1}. ${truncate(p, 220)}`)
      : ['  (none)']),
    ``,
    `Recent answers (${s.recent_answers.length}):`,
    ...(s.recent_answers.length
      ? s.recent_answers.map((a, i) => `  ${i + 1}. ${truncate(a, 220)}`)
      : ['  (none)']),
    ``,
    `Recent daily questions asked (${s.recent_questions.length}):`,
    ...(s.recent_questions.length
      ? s.recent_questions.map((q, i) => `  ${i + 1}. ${q}`)
      : ['  (none)']),
    ``,
    `Output the JSON object now.`,
  ];
  return lines.join('\n');
}

function fmt(v: number | null | undefined): string {
  return v == null ? 'n/a' : String(v);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ----------------------------------------------------------------------------
// Validator
// ----------------------------------------------------------------------------
export type ActivityPattern = 'dormant' | 'sparse' | 'steady' | 'bursty' | 'daily';
const VALID_PATTERNS = new Set<ActivityPattern>(['dormant', 'sparse', 'steady', 'bursty', 'daily']);

export interface Classification {
  purpose: CirclePurpose;
  audience: 'campus' | 'young_adult' | 'professional' | 'mixed';
  subtopics: string[];
  vibe_keywords: string[];
  summary: string;
  health_score: number;
  activity_pattern: ActivityPattern;
}

export function validateClassification(
  raw: string
): { ok: true; value: Classification } | { ok: false; reason: string } {
  let parsed: any;
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, reason: 'not_valid_json' };
  }

  const purpose = typeof parsed.purpose === 'string' ? parsed.purpose.trim() : '';
  const audience = typeof parsed.audience === 'string' ? parsed.audience.trim() : '';
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';

  if (!VALID_PURPOSES.has(purpose)) return { ok: false, reason: `bad_purpose:${purpose}` };
  if (!VALID_AUDIENCES.has(audience)) return { ok: false, reason: `bad_audience:${audience}` };
  if (!summary) return { ok: false, reason: 'empty_summary' };
  if (summary.length > 280) return { ok: false, reason: 'summary_too_long' };

  const healthRaw = Number(parsed.health_score);
  if (!Number.isFinite(healthRaw)) return { ok: false, reason: 'bad_health_score' };
  const health_score = Math.max(0, Math.min(1, Number(healthRaw.toFixed(2))));

  const pattern = typeof parsed.activity_pattern === 'string' ? parsed.activity_pattern.trim() : '';
  if (!VALID_PATTERNS.has(pattern as ActivityPattern))
    return { ok: false, reason: `bad_activity_pattern:${pattern}` };

  const subtopics = sanitizeStringArray(parsed.subtopics, 5, 32);
  const vibeKeywords = sanitizeStringArray(parsed.vibe_keywords, 5, 24);

  return {
    ok: true,
    value: {
      purpose: purpose as CirclePurpose,
      audience: audience as Classification['audience'],
      subtopics,
      vibe_keywords: vibeKeywords,
      summary,
      health_score,
      activity_pattern: pattern as ActivityPattern,
    },
  };
}

function sanitizeStringArray(input: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().toLowerCase();
    if (!trimmed || trimmed.length > maxLen) continue;
    if (out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Persistence
// ----------------------------------------------------------------------------
async function upsertProfile(
  supa: any,
  circleId: string,
  cls: Classification,
  embedding: number[] | null,
  preserveLockedPurpose: boolean,
  engagement: EngagementStats,
  previousPurpose: string | null
): Promise<{ changed: boolean }> {
  // If owner has locked the purpose, never overwrite it. We still refresh
  // every other field from the AI run.
  const baseRow: Record<string, unknown> = {
    circle_id: circleId,
    audience: cls.audience,
    subtopics: cls.subtopics,
    vibe_keywords: cls.vibe_keywords,
    summary: cls.summary,
    health_score: cls.health_score,
    activity_pattern: cls.activity_pattern,
    engagement_stats: engagement,
    last_activity_at: new Date().toISOString(),
    classified_at: new Date().toISOString(),
    classified_by: preserveLockedPurpose ? 'hybrid' : 'ai',
    signal_version: 2,
  };
  if (!preserveLockedPurpose) baseRow.purpose = cls.purpose;
  if (embedding) baseRow.embedding = toPgVector(embedding);

  await supa.from('circle_profile').upsert(baseRow, { onConflict: 'circle_id' });

  const changed = previousPurpose !== null && previousPurpose !== cls.purpose;
  return { changed };
}

async function logTrainingEvent(
  supa: any,
  eventType: 'classification_applied' | 'classification_changed',
  circleId: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Fire-and-forget; never block the classifier on this.
  try {
    await supa.from('circle_training_events').insert({
      event_type: eventType,
      circle_id: circleId,
      payload,
    });
  } catch {
    /* swallow — training log is best-effort */
  }
}

// ----------------------------------------------------------------------------
// Per-circle pipeline
// ----------------------------------------------------------------------------
async function classifyOne(
  supa: any,
  circle: { id: string; name: string; purpose_locked: boolean }
): Promise<{ circleId: string; status: string; reason?: string }> {
  // Gather signals -----------------------------------------------------------
  // Engagement aggregates come from the migration-025 RPC. Previous purpose is
  // read so we can detect classification drift and log it as a training event.
  const [memberRes, postRes, answerRes, questionRes, signalsRes, prevProfileRes] =
    await Promise.all([
      supa
        .from('memberships')
        .select('user_id, profiles:user_id(display_name)')
        .eq('circle_id', circle.id)
        .is('left_at', null)
        .limit(20),
      supa
        .from('posts')
        .select('body')
        .eq('circle_id', circle.id)
        .eq('moderation_status', 'ok')
        .is('deleted_at', null)
        .not('body', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20),
      supa
        .from('question_answers')
        .select('body')
        .eq('circle_id', circle.id)
        .eq('moderation_status', 'ok')
        .not('body', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20),
      supa
        .from('daily_questions')
        .select('question_text')
        .eq('circle_id', circle.id)
        .order('drops_at', { ascending: false })
        .limit(10),
      supa.rpc('get_circle_signals', { p_circle_id: circle.id, p_days: 14 }),
      supa
        .from('circle_profile')
        .select('purpose, health_score, activity_pattern')
        .eq('circle_id', circle.id)
        .maybeSingle(),
    ]);

  const memberNames: string[] = (memberRes.data ?? [])
    .map((m: any) => m?.profiles?.display_name)
    .filter((n: any) => typeof n === 'string' && n.length > 0);
  const recentPosts: string[] = (postRes.data ?? []).map((p: any) => p.body).filter(Boolean);
  const recentAnswers: string[] = (answerRes.data ?? []).map((a: any) => a.body).filter(Boolean);
  const recentQuestions: string[] = (questionRes.data ?? [])
    .map((q: any) => q.question_text)
    .filter(Boolean);

  // Engagement aggregates. If the RPC isn't deployed yet or errors, fall back
  // to a zeroed object so the rest of the pipeline still runs.
  const engagement: EngagementStats = normalizeSignals(signalsRes?.data, 14);
  const previousPurpose: string | null = prevProfileRes?.data?.purpose ?? null;

  const signalCount = recentPosts.length + recentAnswers.length;
  if (signalCount < MIN_SIGNAL) {
    return { circleId: circle.id, status: 'skipped_low_signal' };
  }

  const signals: CircleSignals = {
    circle_id: circle.id,
    circle_name: circle.name,
    member_names: memberNames,
    recent_posts: recentPosts,
    recent_answers: recentAnswers,
    recent_questions: recentQuestions,
    engagement,
    signal_count: signalCount,
  };

  // Classify -----------------------------------------------------------------
  const llm = await callLlm({
    agent: 'classify-circle',
    model: MODEL,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(signals) }],
    maxTokens: 400,
    temperature: 0.4,
    circleId: circle.id,
    metadata: { signal_count: signalCount, purpose_locked: circle.purpose_locked },
  });

  if (!llm.text) {
    return { circleId: circle.id, status: 'llm_failed', reason: llm.errorReason ?? 'unknown' };
  }

  const v = validateClassification(llm.text);
  if (!v.ok) {
    return { circleId: circle.id, status: 'invalid_output', reason: v.reason };
  }

  // Embed --------------------------------------------------------------------
  // We embed: summary + subtopics + vibe_keywords. This is what discovery
  // matches against in Phase 2.
  const embeddingInput = [
    `Circle: ${circle.name}`,
    `Purpose: ${v.value.purpose}`,
    `Audience: ${v.value.audience}`,
    v.value.subtopics.length ? `Topics: ${v.value.subtopics.join(', ')}` : '',
    v.value.vibe_keywords.length ? `Vibe: ${v.value.vibe_keywords.join(', ')}` : '',
    `Summary: ${v.value.summary}`,
  ]
    .filter(Boolean)
    .join('\n');

  const emb = await callEmbedding({
    text: embeddingInput,
    circleId: circle.id,
    metadata: { agent: 'classify-circle' },
  });

  // Even if embedding fails we still write the structured profile — the
  // adaptive curator (Phase 1.5) only needs purpose + subtopics. Discovery
  // (Phase 2) will skip circles without an embedding.
  const { changed } = await upsertProfile(
    supa,
    circle.id,
    v.value,
    emb.vector,
    circle.purpose_locked,
    engagement,
    previousPurpose
  );

  // Append-only training log: every applied classification plus a distinct
  // event when the purpose drifts. Used for offline training / audit.
  await logTrainingEvent(supa, 'classification_applied', circle.id, {
    purpose: v.value.purpose,
    audience: v.value.audience,
    subtopics_count: v.value.subtopics.length,
    health_score: v.value.health_score,
    activity_pattern: v.value.activity_pattern,
    signal_count: signalCount,
    engagement_snapshot: engagement,
    purpose_locked: circle.purpose_locked,
  });
  if (changed) {
    await logTrainingEvent(supa, 'classification_changed', circle.id, {
      from: previousPurpose,
      to: v.value.purpose,
    });
  }

  return {
    circleId: circle.id,
    status: emb.vector ? 'classified' : 'classified_no_embedding',
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function normalizeSignals(raw: any, daysWindow: number): EngagementStats {
  const src = raw ?? {};
  const num = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const int = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  };
  return {
    days_window: int(src.days_window ?? daysWindow) || daysWindow,
    members: int(src.members),
    active_members: int(src.active_members),
    posts: int(src.posts),
    answers: int(src.answers),
    reactions: int(src.reactions),
    replies: int(src.replies),
    mentions: int(src.mentions),
    deleted: int(src.deleted),
    avg_response_seconds: num(src.avg_response_seconds),
    top_reaction_kind: typeof src.top_reaction_kind === 'string' ? src.top_reaction_kind : null,
    participation_ratio: num(src.participation_ratio),
    reaction_ratio: num(src.reaction_ratio),
    signal_count: int(src.signal_count),
  };
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  let body: { circle_id?: string; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Decide which circles to process ------------------------------------------
  let circles: Array<{ id: string; name: string; purpose_locked: boolean }> = [];

  if (body.circle_id) {
    const { data, error } = await supa
      .from('circles')
      .select('id, name, purpose_locked')
      .eq('id', body.circle_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return jsonResponse({ error: error?.message ?? 'not_found' }, 404);
    circles = [data];
  } else {
    // Cron path: classify circles with no profile, or stale (> STALE_DAYS).
    // Skip purpose_locked circles entirely on the cron path — owners get to
    // refresh those manually from the info screen.
    const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400 * 1000).toISOString();
    const { data, error } = await supa.rpc('circles_needing_classification', {
      p_stale_before: staleCutoff,
      p_limit: BATCH_LIMIT,
    });
    if (error) return jsonResponse({ error: error.message }, 500);
    circles = (data ?? []) as typeof circles;
  }

  const results: Array<{ circleId: string; status: string; reason?: string }> = [];
  const stats = { processed: 0, classified: 0, skipped: 0, errors: 0 };

  for (const circle of circles) {
    stats.processed++;
    try {
      const r = await classifyOne(supa, circle);
      results.push(r);
      if (r.status.startsWith('classified')) stats.classified++;
      else if (r.status.startsWith('skipped')) stats.skipped++;
      else stats.errors++;
    } catch (err) {
      stats.errors++;
      results.push({
        circleId: circle.id,
        status: 'exception',
        reason: (err as Error)?.message ?? String(err),
      });
    }
  }

  return jsonResponse({ ...stats, results });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
