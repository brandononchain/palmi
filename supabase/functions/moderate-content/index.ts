// ============================================================================
// palmi: Agent 3 — Moderator
// Edge Function: moderate-content
// ============================================================================
//
// Synchronous pre-publication content safety. Called by the client before it
// would otherwise insert a post or question_answer. The function performs
// moderation AND the insert in one server-side hop, so the client cannot
// skip the moderator.
//
// Request:
//   POST /moderate-content
//   { circle_id, content_type: 'post' | 'answer',
//     body?, photo_url?, question_id? }
//
// Response:
//   200 { verdict: 'pass' | 'hold' | 'reject',
//         categories: string[],
//         reason?: string,
//         content_id?: string }   (present on pass/hold)
//
// Verdicts:
//   pass   -> row inserted with moderation_status = 'ok'
//   hold   -> row inserted with moderation_status = 'held' (author-only view)
//   reject -> NO row inserted; event logged with content_id = null
//
// Categories (from spec):
//   nsfw, self_harm, targeted_harassment, csam,
//   real_names_of_non_members, illegal_content
//
// Rules:
//   - csam: any signal -> reject, always (never holds, never passes)
//   - any other flagged category -> hold
//   - nothing flagged -> pass
//   - infra failure (network / API / parse) -> fail OPEN (treat as pass)
//     and log a moderation_events row with verdict='pass', model='fail_open'
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Categories the classifier may emit --------------------------------------------
export const CATEGORIES = [
  "nsfw",
  "self_harm",
  "targeted_harassment",
  "csam",
  "real_names_of_non_members",
  "illegal_content",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Verdict = "pass" | "hold" | "reject";

export interface ClassifierOutput {
  categories: Category[];
  confidence: number; // 0..1
  reason: string; // short, user-shown-on-reject hint
}

export interface ModerateRequest {
  circle_id: string;
  content_type: "post" | "answer";
  body?: string | null;
  photo_url?: string | null;
  question_id?: string | null;
}

export interface ModerateResponse {
  verdict: Verdict;
  categories: Category[];
  reason?: string;
  content_id?: string;
}

// ============================================================================
// Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are the content safety classifier for palmi, a small-circle social app where 2–15 real-life friends share posts and daily-question answers.

The circle is private and trusted. People vent, joke, swear, discuss mental health, share grief, and talk about their real lives. Do NOT flag ordinary negative emotion, profanity, venting, dark humor, or casual references to public figures.

Your job is to decide whether the content is safe to publish to the author's circle. Classify against EXACTLY these six categories:

- nsfw: sexual imagery or detailed sexual content. Casual body references, flirting, or mentions of sex are NOT nsfw.
- self_harm: content actively encouraging, instructing, or glorifying self-harm or suicide. Someone saying "I'm struggling" or "I've been depressed" is NOT self_harm — that is what this app is for.
- targeted_harassment: a direct attack or slur aimed at an identifiable person or protected group. General frustration ("my boss is a jerk") is NOT targeted_harassment. Slurs weaponized at a group are.
- csam: any sexual or sexualized content involving minors. Zero tolerance. If unsure, flag.
- real_names_of_non_members: full real names (first + last, or clearly identifying) of people who are NOT members of this circle, in a context that could out, dox, or expose them. First-name-only mentions of friends, coworkers, or family are FINE. Public figures (celebrities, politicians, athletes) are FINE. Dead relatives by first name are FINE.
- illegal_content: concrete instructions or solicitation for serious crimes (weapons manufacture, hard-drug synthesis, fraud instructions, violent threats). Casual references to drug use, minor traffic violations, or "I want to kill my coworker" as hyperbole are NOT illegal_content.

You will be given the circle's member first names. Treat those names as in-circle and safe.

Return ONLY a JSON object with this exact shape:
{
  "categories": [<zero or more of the six strings above>],
  "confidence": <number between 0 and 1>,
  "reason": "<one short sentence explaining the flag, or empty string if no flags>"
}

Default to an empty categories array. Only flag when you are clearly correct. Over-moderation breaks the product.`;

// ============================================================================
// Validator (pure, tested)
// ============================================================================

export function parseClassifierOutput(raw: string): ClassifierOutput | null {
  if (!raw) return null;
  // Strip markdown fences the model sometimes adds.
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  }
  let parsed: any;
  try {
    parsed = JSON.parse(s);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const cats = Array.isArray(parsed.categories) ? parsed.categories : [];
  const filtered: Category[] = [];
  for (const c of cats) {
    if (typeof c === "string" && (CATEGORIES as readonly string[]).includes(c)) {
      if (!filtered.includes(c as Category)) filtered.push(c as Category);
    }
  }

  let conf = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
  if (!Number.isFinite(conf)) conf = 0.5;
  if (conf < 0) conf = 0;
  if (conf > 1) conf = 1;

  const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 240) : "";

  return { categories: filtered, confidence: conf, reason };
}

export function verdictFor(output: ClassifierOutput): Verdict {
  // csam is always a reject regardless of other signals.
  if (output.categories.includes("csam")) return "reject";
  if (output.categories.length === 0) return "pass";
  return "hold";
}

// User-facing rejection reason. Deliberately vague to avoid gaming.
export function rejectionMessage(output: ClassifierOutput): string {
  return "This didn't post — please try rewording.";
}

// ============================================================================
// CORS
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ============================================================================
// Anthropic call
// ============================================================================

async function classify(
  apiKey: string,
  memberNames: string[],
  req: ModerateRequest,
): Promise<ClassifierOutput | null> {
  const userContent = [
    `Circle member first names: ${memberNames.length ? memberNames.join(", ") : "(none provided)"}`,
    `Content type: ${req.content_type}`,
    `Has photo: ${req.photo_url ? "yes" : "no"}`,
    `Body:`,
    (req.body ?? "").trim() || "(no text; photo only)",
  ].join("\n");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") return null;
  return parseClassifierOutput(text);
}

// ============================================================================
// Handler
// ============================================================================

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return json({ error: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "unauthenticated" }, 401);
  }

  let body: ModerateRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  if (!body?.circle_id || (body.content_type !== "post" && body.content_type !== "answer")) {
    return json({ error: "bad_request" }, 400);
  }
  if (!body.body && !body.photo_url) {
    return json({ error: "empty_content" }, 400);
  }
  if (body.content_type === "answer" && !body.question_id) {
    return json({ error: "missing_question" }, 400);
  }

  // Client (user-scoped) — for identity + RLS checks + the final insert.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  // Service client — for moderation_events audit + classifier-side member lookup.
  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "unauthenticated" }, 401);
  const userId = userRes.user.id;

  // Membership check — the user must be in the circle they're posting to.
  const { data: mem } = await service
    .from("memberships")
    .select("id")
    .eq("circle_id", body.circle_id)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();
  if (!mem) return json({ error: "forbidden" }, 403);

  // Fetch member first names for classifier context — only this circle, by rule.
  const { data: memberRows } = await service
    .from("memberships")
    .select("profiles:user_id(display_name)")
    .eq("circle_id", body.circle_id)
    .is("left_at", null);
  const memberNames: string[] = (memberRows ?? [])
    .map((r: any) => (r.profiles?.display_name ?? "").split(" ")[0])
    .filter((n: string) => n.length > 0);

  // Classify. Fail OPEN on any infra failure.
  let output: ClassifierOutput | null = null;
  let infraError: string | null = null;
  if (!ANTHROPIC_API_KEY) {
    infraError = "no_api_key";
  } else {
    try {
      output = await classify(ANTHROPIC_API_KEY, memberNames, body);
      if (!output) infraError = "classifier_parse_failed";
    } catch (e) {
      infraError = `classifier_error:${(e as Error).message}`;
    }
  }

  let verdict: Verdict;
  let categories: Category[] = [];
  let reason = "";
  let score: number | null = null;
  let modelLabel = MODEL;

  if (infraError || !output) {
    // Fail open — the content goes through but we log the outage.
    verdict = "pass";
    categories = [];
    reason = "";
    modelLabel = "fail_open";
  } else {
    verdict = verdictFor(output);
    categories = output.categories;
    reason = output.reason;
    score = output.confidence;
  }

  // Insert the content (only on pass/hold).
  let contentId: string | undefined;
  if (verdict === "pass" || verdict === "hold") {
    const modStatus = verdict === "pass" ? "ok" : "held";
    if (body.content_type === "post") {
      const { data, error } = await userClient
        .from("posts")
        .insert({
          circle_id: body.circle_id,
          author_id: userId,
          body: body.body?.trim() || null,
          photo_url: body.photo_url ?? null,
          moderation_status: modStatus,
        })
        .select("id")
        .single();
      if (error) return json({ error: "insert_failed", detail: error.message }, 500);
      contentId = data.id;
    } else {
      const { data, error } = await userClient
        .from("question_answers")
        .insert({
          question_id: body.question_id!,
          circle_id: body.circle_id,
          author_id: userId,
          body: body.body?.trim() || null,
          photo_url: body.photo_url ?? null,
          moderation_status: modStatus,
        })
        .select("id")
        .single();
      if (error) return json({ error: "insert_failed", detail: error.message }, 500);
      contentId = data.id;
    }
  }

  // Audit every run.
  await service.from("moderation_events").insert({
    content_type: body.content_type === "post" ? "post" : "answer",
    content_id: contentId ?? null,
    verdict,
    categories,
    score,
    model: modelLabel,
    reason: infraError ?? reason ?? null,
  });

  const resp: ModerateResponse = {
    verdict,
    categories,
    ...(contentId ? { content_id: contentId } : {}),
    ...(verdict === "reject" ? { reason: rejectionMessage(output!) } : {}),
  };
  return json(resp);
}

// Deno entrypoint. Not started when imported from tests.
if (import.meta.main) {
  serve(handler);
}

export { handler };
