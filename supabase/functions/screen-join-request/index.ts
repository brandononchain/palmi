// ============================================================================
// palmi: Phase 2.5 — Join Request Screener
// Edge Function: screen-join-request
// ============================================================================
//
// Auxiliary AI step that runs after a user submits a join request to a
// circle in `open_screened` admission mode. It does NOT replace owner
// approval — it produces a recommendation and (for clearly safe cases on
// open_screened circles) optionally auto-approves, sparing the owner a tap.
//
// For circles in `request` mode (no auto-approve), the function still runs
// to populate screening_recommendation so the owner sees a hint in the
// requests inbox, but it never auto-approves.
//
// Request:
//   POST /screen-join-request
//   { request_id: uuid }
//
// Response:
//   200 { recommendation: 'safe_auto_approve' | 'needs_owner_review' | 'reject',
//         reason: string,
//         auto_approved: boolean }
//
// Service-role write path: uses set_join_request_screening RPC.
// Caller must be authenticated; the request_id must belong to the caller
// (defense in depth — the discover/find UI will only call this for requests
// it just submitted).
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { callLlm } from '../_shared/llm.ts';

const MODEL = 'claude-haiku-4-5-20251001';

export type Recommendation = 'safe_auto_approve' | 'needs_owner_review' | 'reject';

export interface ScreeningOutput {
  recommendation: Recommendation;
  reason: string;
}

// ============================================================================
// Validators (exported for tests)
// ============================================================================

const VALID_RECS: Recommendation[] = ['safe_auto_approve', 'needs_owner_review', 'reject'];

export function parseScreeningJson(raw: string): ScreeningOutput | null {
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
  const rec = typeof obj.recommendation === 'string' ? obj.recommendation : null;
  const reason = typeof obj.reason === 'string' ? obj.reason.trim() : '';
  if (!rec || !VALID_RECS.includes(rec as Recommendation)) return null;
  if (!reason) return null;
  return {
    recommendation: rec as Recommendation,
    reason: reason.slice(0, 240),
  };
}

// ============================================================================
// Prompt
// ============================================================================

const SYSTEM_PROMPT = `You screen join requests for small private circles (2–15 people) on a calm app called palmi.

Output ONLY a single JSON object:
{ "recommendation": one of "safe_auto_approve" | "needs_owner_review" | "reject",
  "reason": short, calm sentence ≤ 200 chars explaining the call }

Use this rubric:
- "safe_auto_approve" only when ALL are true:
  * the user's stated intent is clearly aligned with the circle's purpose and audience,
  * the intent text shows real care (specific, sincere, no spam),
  * no red flags in the intent (no harassment, no commercial spam, no unrelated solicitation, no recruiting, no NSFW content, no mention of minors in a way that conflicts with the circle's audience).
- "reject" when the intent contains red flags: harassment, hate, sexual content, scams, phishing, recruiting people out of the circle, or grossly unrelated to the circle.
- "needs_owner_review" for the broad middle: relevant but ambiguous, vague intent, weak signal, mismatched audience, or any case you'd want a human to look at.

Be conservative. When in doubt, choose "needs_owner_review" — never auto-approve a borderline case.
Be calm and specific in the reason. Never use marketing language. Never include emoji.`;

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

interface ScreenRequest {
  request_id: string;
}

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

  let body: ScreenRequest;
  try {
    body = (await req.json()) as ScreenRequest;
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  if (!body?.request_id || typeof body.request_id !== 'string') {
    return json({ error: 'bad_request' }, 400);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: 'unauthenticated' }, 401);
  const userId = userRes.user.id;

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  // Load the request and verify the caller is the requester (so users can
  // only trigger screening for requests they themselves submitted).
  const { data: request } = await service
    .from('circle_join_requests')
    .select('id, circle_id, requester_id, intent_text, status')
    .eq('id', body.request_id)
    .maybeSingle();

  if (!request) return json({ error: 'request_not_found' }, 404);
  if (request.requester_id !== userId) return json({ error: 'forbidden' }, 403);
  if (request.status !== 'pending') {
    return json({ error: 'already_decided' }, 409);
  }

  // Pull circle + profile for context
  const { data: circle } = await service
    .from('circles')
    .select('id, name, admission_mode, discovery_blurb')
    .eq('id', request.circle_id)
    .maybeSingle();
  if (!circle) return json({ error: 'circle_not_found' }, 404);

  const { data: profile } = await service
    .from('circle_profile')
    .select('purpose, audience, subtopics, vibe_keywords, summary')
    .eq('circle_id', request.circle_id)
    .maybeSingle();

  const promptInput = {
    circle: {
      name: circle.name,
      admission_mode: circle.admission_mode,
      blurb: circle.discovery_blurb,
      purpose: profile?.purpose ?? null,
      audience: profile?.audience ?? null,
      subtopics: profile?.subtopics ?? [],
      vibe_keywords: profile?.vibe_keywords ?? [],
      summary: profile?.summary ?? null,
    },
    request: {
      intent_text: request.intent_text,
    },
  };

  const llm = await callLlm({
    agent: 'screen-join-request',
    model: MODEL,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(promptInput) }],
    maxTokens: 300,
    timeoutMs: 8000,
    maxAttempts: 2,
    circleId: circle.id,
    metadata: { request_id: request.id },
  });

  // Default conservative outcome on any LLM failure: needs_owner_review with
  // an honest reason. Never auto-approve on a failure path.
  let result: ScreeningOutput = {
    recommendation: 'needs_owner_review',
    reason: 'screening unavailable; sending to owner for review.',
  };
  if (llm.text) {
    const parsed = parseScreeningJson(llm.text);
    if (parsed) result = parsed;
  }

  // Auto-approve only on open_screened circles AND only when the model said so.
  const autoApprove =
    circle.admission_mode === 'open_screened' && result.recommendation === 'safe_auto_approve';

  const { error: writeErr } = await service.rpc('set_join_request_screening', {
    p_request_id: request.id,
    p_recommendation: result.recommendation,
    p_reason: result.reason,
    p_auto_approve: autoApprove,
  });
  if (writeErr) {
    return json({ error: 'write_failed', detail: writeErr.message }, 500);
  }

  // Re-read status to know whether auto-approve actually fired (RPC may have
  // silently held back if the circle was full or requester was at cap).
  const { data: post } = await service
    .from('circle_join_requests')
    .select('status')
    .eq('id', request.id)
    .maybeSingle();

  // Training event: what did the screener recommend, and did auto-approve
  // actually fire? Payload is aggregate-only — no request body stored here.
  try {
    await service.from('circle_training_events').insert({
      event_type: 'join_request_screened',
      circle_id: request.circle_id,
      actor_id: userRes.user.id,
      payload: {
        request_id: request.id,
        recommendation: result.recommendation,
        auto_approved: post?.status === 'approved',
        reason_len: (result.reason ?? '').length,
      },
    });
  } catch {
    /* best effort */
  }

  return json({
    recommendation: result.recommendation,
    reason: result.reason,
    auto_approved: post?.status === 'approved',
  });
}

if (import.meta.main) {
  serve(handler);
}

export { handler };
