// ============================================================================
// palmi: Phase 2.3 — Intent Discovery Agent
// Edge Function: discover-circles
// ============================================================================
//
// Natural-language circle finder. Called from app/app/(tabs)/circles/find.tsx
// when a user types something like "find me a biology study group" or
// "connect me with a small private investor circle".
//
// Pipeline:
//   1. Authenticate the caller; reject anonymous.
//   2. Validate query (1–500 chars).
//   3. LLM #1 (parser): turn the raw query into a structured intent
//      { purpose, audience, subtopics[], constraints[] }.
//   4. Embed the raw query (plus normalized keywords) via OpenAI.
//   5. RPC match_discoverable_circles(): pgvector top-N, hard-filtered.
//   6. LLM #2 (re-ranker): for the top set, score fit and produce a
//      one-sentence "why this might fit you" line per result.
//   7. Insert a row into user_intent_log with the embedding.
//   8. Return up to 5 results to the client.
//
// Privacy: discoverable=false circles are never returned. The match RPC
// enforces this at the DB; we double-check at the boundary just in case.
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { callLlm } from '../_shared/llm.ts';
import { callEmbedding, toPgVector } from '../_shared/embeddings.ts';

const MODEL = 'claude-haiku-4-5-20251001';

// Result count surfaced to the client.
const FINAL_RESULT_LIMIT = 5;
// Candidate count fetched from pgvector before re-ranking.
const CANDIDATE_LIMIT = 20;

// Allowed values for parsed_intent.purpose. Mirrors curatorVariants.ts.
const PURPOSES = [
  'friends',
  'study',
  'professional',
  'interest',
  'wellness',
  'creator',
  'local',
  'support',
  'mixed',
] as const;
type Purpose = (typeof PURPOSES)[number];

// ============================================================================
// Request / response shapes
// ============================================================================

export interface DiscoverRequest {
  query_text: string;
}

export interface DiscoverResult {
  circle_id: string;
  name: string;
  blurb: string | null;
  purpose: string | null;
  admission_mode: 'request' | 'open_screened';
  member_count: number;
  fit_reason: string;
  similarity: number;
}

export interface DiscoverResponse {
  results: DiscoverResult[];
  parsed_intent: ParsedIntent | null;
  query_id: string | null;
  quota?: { remaining: number; used: number; quota: number; tier: string } | null;
}

export interface ParsedIntent {
  purpose: Purpose | null;
  audience: string | null;
  subtopics: string[];
  constraints: string[];
}

// ============================================================================
// Validators (exported for tests)
// ============================================================================

export function validateQuery(q: unknown): string | null {
  if (typeof q !== 'string') return null;
  const trimmed = q.trim();
  if (trimmed.length < 1 || trimmed.length > 500) return null;
  return trimmed;
}

export function parseIntentJson(raw: string): ParsedIntent | null {
  // The model is instructed to return strict JSON. Strip code fences if present.
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1].trim();
  let obj: any;
  try {
    obj = JSON.parse(s);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  const purpose =
    typeof obj.purpose === 'string' && (PURPOSES as readonly string[]).includes(obj.purpose)
      ? (obj.purpose as Purpose)
      : null;
  const audience = typeof obj.audience === 'string' ? obj.audience.slice(0, 80) : null;
  const subtopics = Array.isArray(obj.subtopics)
    ? obj.subtopics
        .filter((x: any) => typeof x === 'string' && x.length > 0)
        .slice(0, 8)
        .map((x: string) => x.slice(0, 40))
    : [];
  const constraints = Array.isArray(obj.constraints)
    ? obj.constraints
        .filter((x: any) => typeof x === 'string' && x.length > 0)
        .slice(0, 6)
        .map((x: string) => x.slice(0, 80))
    : [];

  return { purpose, audience, subtopics, constraints };
}

export interface RankerScore {
  circle_id: string;
  fit: number; // 0..100
  fit_reason: string;
}

export function parseRankerJson(raw: string): RankerScore[] | null {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1].trim();
  let obj: any;
  try {
    obj = JSON.parse(s);
  } catch {
    return null;
  }
  const arr = Array.isArray(obj) ? obj : Array.isArray(obj?.results) ? obj.results : null;
  if (!arr) return null;
  const out: RankerScore[] = [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue;
    const id = typeof r.circle_id === 'string' ? r.circle_id : null;
    const fitRaw = typeof r.fit === 'number' ? r.fit : Number(r.fit);
    const reason = typeof r.fit_reason === 'string' ? r.fit_reason.trim() : '';
    if (!id || !Number.isFinite(fitRaw) || !reason) continue;
    out.push({
      circle_id: id,
      fit: Math.max(0, Math.min(100, Math.round(fitRaw))),
      fit_reason: reason.slice(0, 200),
    });
  }
  return out;
}

// ============================================================================
// Prompts
// ============================================================================

const PARSER_SYSTEM = `You are a quiet matchmaker for a small, calm social app called palmi.
Your job is to turn one short user query into a structured intent JSON.

The user is looking for a small private "circle" (2–15 people) to join.
Output ONLY a single JSON object, no prose, no markdown, no code fences.

Schema:
{
  "purpose": one of "friends" | "study" | "professional" | "interest" | "wellness" | "creator" | "local" | "support" | "mixed",
  "audience": short phrase describing who the user wants to be around, or null,
  "subtopics": array of short topical tags (≤ 8, each ≤ 40 chars),
  "constraints": array of short phrases the user explicitly asked for (e.g. "private", "small group", "weekly", "near Austin"; ≤ 6, each ≤ 80 chars)
}

Rules:
- "friends" is the default for vague social requests (e.g. "people to hang out with").
- Use "support" for explicitly emotional / recovery / hard-time framing.
- Use "interest" for hobbies and fandom (books, anime, photography, etc.).
- Use "creator" only when the user mentions making/shipping work with peers.
- Use "professional" for career, founders, investors, industry-specific networking.
- Use "study" for learning groups, exam prep, courses.
- Use "wellness" for fitness, meditation, nutrition, sobriety as a positive routine.
- Use "local" only when geography is the dominant axis.
- Be specific in subtopics — extract concrete nouns the user said.
- Never invent constraints the user didn't state.`;

const RANKER_SYSTEM = `You score how well each candidate circle fits a user's stated intent.

Output ONLY a single JSON array. No prose, no code fences. Each element:
{ "circle_id": string, "fit": integer 0–100, "fit_reason": one short sentence ≤ 160 chars }

Scoring rubric:
- Heavy weight on alignment between the user's purpose/subtopics and the circle's purpose/subtopics.
- Bonus for explicit overlap of vibe_keywords with the user's tone.
- Penalize when the circle's audience contradicts the user's audience (e.g. "early career" vs "senior").
- Slight bonus for circles with room (smaller member_count means more room to land).
- Never reward closed/invite-only circles — they shouldn't be in this list at all.
- fit_reason must be calm, lowercase-friendly, and grounded in the circle's own profile. No marketing language. No emoji.

If a candidate clearly does not fit, give it a low score (≤ 20). Do not omit candidates.`;

// ============================================================================
// CORS
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// ============================================================================
// Handler
// ============================================================================

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthenticated' }, 401);

  let body: DiscoverRequest;
  try {
    body = (await req.json()) as DiscoverRequest;
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const queryText = validateQuery(body?.query_text);
  if (!queryText) return json({ error: 'bad_query' }, 400);

  // Identify caller
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: 'unauthenticated' }, 401);
  const userId = userRes.user.id;

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: quotaRows } = await service.rpc('check_discovery_quota', {
    p_user: userId,
  });
  const currentQuota =
    (quotaRows?.[0] as
      | { remaining: number; used: number; quota: number; tier: string }
      | undefined) ?? null;

  if (currentQuota && currentQuota.quota >= 0 && currentQuota.remaining <= 0) {
    return json({ error: 'discovery_quota_reached', quota: currentQuota }, 429);
  }

  await service.rpc('consume_discovery_quota', { p_user: userId });
  const { data: nextQuotaRows } = await service.rpc('check_discovery_quota', { p_user: userId });
  const nextQuota =
    (nextQuotaRows?.[0] as
      | { remaining: number; used: number; quota: number; tier: string }
      | undefined) ?? currentQuota;

  // ---- Step 1: parse intent --------------------------------------------------
  let parsed: ParsedIntent | null = null;
  const parserResp = await callLlm({
    agent: 'discover-circles',
    model: MODEL,
    system: PARSER_SYSTEM,
    messages: [{ role: 'user', content: queryText }],
    maxTokens: 400,
    timeoutMs: 8000,
    maxAttempts: 2,
    metadata: { stage: 'parse', user_id: userId },
  });
  if (parserResp.text) parsed = parseIntentJson(parserResp.text);

  // ---- Step 2: embed --------------------------------------------------------
  const embedSource = [
    queryText,
    parsed?.purpose ? `purpose: ${parsed.purpose}` : '',
    parsed?.audience ? `audience: ${parsed.audience}` : '',
    parsed?.subtopics?.length ? `topics: ${parsed.subtopics.join(', ')}` : '',
    parsed?.constraints?.length ? `constraints: ${parsed.constraints.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const embedResp = await callEmbedding({
    text: embedSource,
    metadata: { agent: 'discover-circles', stage: 'query_embed', user_id: userId },
  });

  if (!embedResp.vector) {
    // Embedding failure ⇒ we cannot match. Log the query for debugging,
    // return empty results gracefully.
    await service.from('user_intent_log').insert({
      user_id: userId,
      query_text: queryText,
      parsed_intent: parsed,
      embedding: null,
      result_count: 0,
    });
    return json({ results: [], parsed_intent: parsed, query_id: null } as DiscoverResponse);
  }

  // ---- Step 3: pgvector match -----------------------------------------------
  const { data: candidates, error: matchErr } = await service.rpc('match_discoverable_circles', {
    p_user_id: userId,
    p_query_embedding: toPgVector(embedResp.vector),
    p_limit: CANDIDATE_LIMIT,
  });

  if (matchErr) {
    return json({ error: 'match_failed', detail: matchErr.message }, 500);
  }

  const candList: Array<{
    circle_id: string;
    name: string;
    discovery_blurb: string | null;
    admission_mode: string;
    member_count: number;
    purpose: string | null;
    audience: string | null;
    subtopics: string[] | null;
    vibe_keywords: string[] | null;
    summary: string | null;
    similarity: number;
  }> = candidates ?? [];

  // Defense in depth: filter again to the only modes we ever surface.
  const safeCandidates = candList.filter(
    (c) => c.admission_mode === 'request' || c.admission_mode === 'open_screened'
  );

  if (safeCandidates.length === 0) {
    const { data: logRow } = await service
      .from('user_intent_log')
      .insert({
        user_id: userId,
        query_text: queryText,
        parsed_intent: parsed,
        embedding: toPgVector(embedResp.vector),
        result_count: 0,
      })
      .select('id')
      .maybeSingle();
    return json({
      results: [],
      parsed_intent: parsed,
      query_id: logRow?.id ?? null,
      quota: nextQuota,
    } as DiscoverResponse);
  }

  // ---- Step 4: LLM re-rank ---------------------------------------------------
  const rankerInput = {
    user_intent: {
      query: queryText,
      ...(parsed ?? {}),
    },
    candidates: safeCandidates.map((c) => ({
      circle_id: c.circle_id,
      name: c.name,
      purpose: c.purpose,
      audience: c.audience,
      subtopics: c.subtopics ?? [],
      vibe_keywords: c.vibe_keywords ?? [],
      summary: c.summary,
      blurb: c.discovery_blurb,
      member_count: c.member_count,
      similarity: Number(c.similarity?.toFixed?.(4) ?? c.similarity ?? 0),
    })),
  };

  let scores: RankerScore[] = [];
  const rankerResp = await callLlm({
    agent: 'discover-circles',
    model: MODEL,
    system: RANKER_SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(rankerInput) }],
    maxTokens: 1200,
    timeoutMs: 12000,
    maxAttempts: 2,
    metadata: { stage: 'rank', user_id: userId, candidate_count: safeCandidates.length },
  });
  if (rankerResp.text) scores = parseRankerJson(rankerResp.text) ?? [];

  // Combine: prefer LLM fit when present, fall back to similarity * 100.
  const scoreById = new Map<string, RankerScore>();
  for (const s of scores) scoreById.set(s.circle_id, s);

  const ranked = safeCandidates
    .map((c) => {
      const s = scoreById.get(c.circle_id);
      const fallbackReason = c.discovery_blurb
        ? `topical overlap with ${c.purpose ?? 'this circle'}`
        : 'topical overlap with your query';
      return {
        candidate: c,
        fit: s?.fit ?? Math.round((c.similarity ?? 0) * 100),
        fit_reason: s?.fit_reason ?? fallbackReason,
      };
    })
    .sort((a, b) => b.fit - a.fit)
    .slice(0, FINAL_RESULT_LIMIT);

  const results: DiscoverResult[] = ranked.map(({ candidate, fit_reason }) => ({
    circle_id: candidate.circle_id,
    name: candidate.name,
    blurb: candidate.discovery_blurb,
    purpose: candidate.purpose,
    admission_mode: candidate.admission_mode as 'request' | 'open_screened',
    member_count: candidate.member_count,
    fit_reason,
    similarity: Number((candidate.similarity ?? 0).toFixed(4)),
  }));

  // ---- Step 5: log query ----------------------------------------------------
  const { data: logRow } = await service
    .from('user_intent_log')
    .insert({
      user_id: userId,
      query_text: queryText,
      parsed_intent: parsed,
      embedding: toPgVector(embedResp.vector),
      result_count: results.length,
    })
    .select('id')
    .maybeSingle();

  // ---- Step 6: training event log ------------------------------------------
  // Matches and misses both feed the training pipeline. Payload is bounded:
  // parsed intent + top candidate ids + scores, no raw bodies or PII.
  try {
    if (results.length > 0) {
      await service.from('circle_training_events').insert(
        results.slice(0, 5).map((r, idx) => ({
          event_type: 'discovery_matched',
          circle_id: r.circle_id,
          actor_id: userId,
          payload: {
            rank: idx,
            fit: r.fit_reason ? 1 : 0,
            similarity: r.similarity,
            admission_mode: r.admission_mode,
            parsed_intent: parsed,
            query_id: logRow?.id ?? null,
          },
        }))
      );
    } else {
      await service.from('circle_training_events').insert({
        event_type: 'discovery_miss',
        circle_id: null,
        actor_id: userId,
        payload: {
          parsed_intent: parsed,
          candidate_count: candList.length,
          query_id: logRow?.id ?? null,
        },
      });
    }
  } catch {
    /* best effort */
  }

  return json({
    results,
    parsed_intent: parsed,
    query_id: logRow?.id ?? null,
    quota: nextQuota,
  } as DiscoverResponse);
}

if (import.meta.main) {
  serve(handler);
}

export { handler };
