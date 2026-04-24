// ============================================================================
// supabase/functions/_shared/llm.ts
// ----------------------------------------------------------------------------
// Shared Anthropic client used by curate-question, write-recap, and
// moderate-content. Centralizes:
//   - HTTP call + retry with exponential backoff on 429 / 5xx / transient errs
//   - Token + cost accounting
//   - Observability row in public.llm_calls
//   - Consistent timeout + abort handling
//
// Keeps per-agent code focused on prompts + validators.
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Pricing (USD per 1M tokens) — update when Anthropic changes pricing.
// Values in USD * 1_000_000 micro-units so the DB can store ints.
const PRICING_MICRO_PER_TOKEN: Record<string, { input: number; output: number }> = {
  // Claude Haiku 4.5: $1 / MTok input, $5 / MTok output. = $0.000001 in / $0.000005 out.
  // Stored as micro-USD per token: 1 / 1_000_000 * 1_000_000 = 1.
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
};

export type LlmStatus =
  | 'ok'
  | 'retried_ok'
  | 'http_error'
  | 'parse_error'
  | 'timeout'
  | 'exception';

export interface LlmRequest {
  agent:
    | 'curate-question'
    | 'write-recap'
    | 'moderate-content'
    | 'classify-circle'
    | 'discover-circles'
    | 'screen-join-request';
  model: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  temperature?: number;
  // Per-attempt timeout in ms. Total wall-clock = timeoutMs * maxAttempts.
  timeoutMs?: number;
  maxAttempts?: number;
  // Optional tag so the log row knows which circle triggered it.
  circleId?: string | null;
  // Free-form breadcrumbs, written to llm_calls.metadata. Keep small.
  metadata?: Record<string, unknown> | null;
}

export interface LlmResponse {
  // Raw text content from the first content block, or null on failure.
  text: string | null;
  status: LlmStatus;
  httpStatus: number | null;
  attempts: number;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsdMicro: number | null;
  errorReason: string | null;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 3;

// ============================================================================
// Retry policy
// ============================================================================

function shouldRetry(status: number | null): boolean {
  if (status === null) return true; // network / abort — retry
  if (status === 429) return true; // rate limited
  if (status >= 500 && status < 600) return true; // server-side
  return false;
}

function backoffMs(attempt: number): number {
  // 400ms, 1.2s, 3.6s (+ jitter)
  const base = 400 * Math.pow(3, attempt - 1);
  const jitter = Math.random() * 300;
  return base + jitter;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================================
// Cost calc
// ============================================================================

function computeCostMicro(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null
): number | null {
  const p = PRICING_MICRO_PER_TOKEN[model];
  if (!p) return null;
  const inCost = (inputTokens ?? 0) * p.input;
  const outCost = (outputTokens ?? 0) * p.output;
  return inCost + outCost;
}

// ============================================================================
// Single attempt
// ============================================================================

async function callOnce(
  apiKey: string,
  req: LlmRequest,
  timeoutMs: number
): Promise<{
  text: string | null;
  httpStatus: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  errorReason: string | null;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
        ...(typeof req.temperature === 'number' ? { temperature: req.temperature } : {}),
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        text: null,
        httpStatus: res.status,
        inputTokens: null,
        outputTokens: null,
        errorReason: `${res.status}_${body.slice(0, 60).replace(/\s+/g, '_')}`,
      };
    }

    const data: any = await res.json().catch(() => null);
    const text = data?.content?.[0]?.text ?? null;
    const inputTokens =
      typeof data?.usage?.input_tokens === 'number' ? data.usage.input_tokens : null;
    const outputTokens =
      typeof data?.usage?.output_tokens === 'number' ? data.usage.output_tokens : null;

    if (typeof text !== 'string') {
      return {
        text: null,
        httpStatus: res.status,
        inputTokens,
        outputTokens,
        errorReason: 'no_text_in_response',
      };
    }

    return { text, httpStatus: res.status, inputTokens, outputTokens, errorReason: null };
  } catch (err) {
    const name = (err as any)?.name ?? '';
    const msg = (err as Error)?.message ?? String(err);
    if (name === 'AbortError') {
      return {
        text: null,
        httpStatus: null,
        inputTokens: null,
        outputTokens: null,
        errorReason: 'timeout',
      };
    }
    return {
      text: null,
      httpStatus: null,
      inputTokens: null,
      outputTokens: null,
      errorReason: `exception:${msg.slice(0, 80)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// Public entrypoint
// ============================================================================

export async function callLlm(req: LlmRequest): Promise<LlmResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = req.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const startedAt = Date.now();

  if (!apiKey) {
    const durationMs = Date.now() - startedAt;
    const resp: LlmResponse = {
      text: null,
      status: 'exception',
      httpStatus: null,
      attempts: 0,
      durationMs,
      inputTokens: null,
      outputTokens: null,
      costUsdMicro: null,
      errorReason: 'no_api_key',
    };
    await logCall(req, resp);
    return resp;
  }

  let lastHttp: number | null = null;
  let lastReason: string | null = null;
  let lastInput: number | null = null;
  let lastOutput: number | null = null;
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptsUsed = attempt;
    const r = await callOnce(apiKey, req, timeoutMs);
    lastHttp = r.httpStatus;
    lastReason = r.errorReason;
    lastInput = r.inputTokens ?? lastInput;
    lastOutput = r.outputTokens ?? lastOutput;

    if (r.text !== null && r.errorReason === null) {
      const durationMs = Date.now() - startedAt;
      const cost = computeCostMicro(req.model, r.inputTokens, r.outputTokens);
      const resp: LlmResponse = {
        text: r.text,
        status: attempt === 1 ? 'ok' : 'retried_ok',
        httpStatus: r.httpStatus,
        attempts: attempt,
        durationMs,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsdMicro: cost,
        errorReason: null,
      };
      await logCall(req, resp);
      return resp;
    }

    if (attempt < maxAttempts && shouldRetry(r.httpStatus)) {
      await sleep(backoffMs(attempt));
      continue;
    }
    break;
  }

  // All attempts exhausted.
  const durationMs = Date.now() - startedAt;
  const cost = computeCostMicro(req.model, lastInput, lastOutput);
  let status: LlmStatus = 'http_error';
  if (lastReason === 'timeout') status = 'timeout';
  else if (lastReason && lastReason.startsWith('exception:')) status = 'exception';
  else if (lastReason === 'no_text_in_response') status = 'parse_error';

  const resp: LlmResponse = {
    text: null,
    status,
    httpStatus: lastHttp,
    attempts: attemptsUsed,
    durationMs,
    inputTokens: lastInput,
    outputTokens: lastOutput,
    costUsdMicro: cost,
    errorReason: lastReason,
  };
  await logCall(req, resp);
  return resp;
}

// ============================================================================
// Observability
// ============================================================================

let _logClient: SupabaseClient | null = null;

function getLogClient(): SupabaseClient | null {
  if (_logClient) return _logClient;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  _logClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _logClient;
}

async function logCall(req: LlmRequest, resp: LlmResponse): Promise<void> {
  const client = getLogClient();
  if (!client) return;
  try {
    await client.from('llm_calls').insert({
      agent: req.agent,
      model: req.model,
      status: resp.status,
      http_status: resp.httpStatus,
      attempt_count: resp.attempts,
      duration_ms: resp.durationMs,
      input_tokens: resp.inputTokens,
      output_tokens: resp.outputTokens,
      cost_usd_micro: resp.costUsdMicro,
      circle_id: req.circleId ?? null,
      error_reason: resp.errorReason,
      metadata: req.metadata ?? null,
    });
  } catch {
    // Observability failures never break the caller.
  }
}
