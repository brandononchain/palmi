// ============================================================================
// supabase/functions/_shared/embeddings.ts
// ----------------------------------------------------------------------------
// OpenAI text-embedding-3-small wrapper (1536-dim). Used by:
//   - classify-circle  (Phase 1): embeds circle summary for discovery search
//   - discover-circles (Phase 2): embeds the user's natural-language query
//
// Logs every call to public.llm_calls with agent='embedding' so cost shows
// up in the same admin dashboard as Anthropic calls. Pricing is per-token,
// stored as USD * 1_000_000 micro-units to match llm_calls.cost_usd_micro.
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// @ts-ignore deno globals
declare const Deno: { env: { get(key: string): string | undefined } };

const OPENAI_URL = 'https://api.openai.com/v1/embeddings';

// text-embedding-3-small: $0.02 / 1M tokens.
// Per-token micro-USD: 0.02 / 1_000_000 * 1_000_000 = 0.02. Round to int via x100.
// Easier: store as fractional micros, total cost computed as tokens * 0.02 / 1.
// For consistency with llm_calls.cost_usd_micro (bigint), we multiply by 100
// then divide on read. Here we just compute the exact micro value as a number
// and round at insert time.
const EMBED_PRICE_PER_MILLION_USD: Record<string, number> = {
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
};

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 3;

export type EmbeddingStatus =
  | 'ok'
  | 'retried_ok'
  | 'http_error'
  | 'timeout'
  | 'exception'
  | 'parse_error';

export interface EmbeddingRequest {
  text: string;
  model?: string;
  circleId?: string | null;
  metadata?: Record<string, unknown> | null;
  timeoutMs?: number;
  maxAttempts?: number;
}

export interface EmbeddingResponse {
  vector: number[] | null;
  status: EmbeddingStatus;
  httpStatus: number | null;
  attempts: number;
  durationMs: number;
  inputTokens: number | null;
  costUsdMicro: number | null;
  errorReason: string | null;
}

function shouldRetry(status: number | null): boolean {
  if (status === null) return true;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

function backoffMs(attempt: number): number {
  return 400 * Math.pow(3, attempt - 1) + Math.random() * 300;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function computeCostMicro(model: string, tokens: number | null): number | null {
  const pricePerMillion = EMBED_PRICE_PER_MILLION_USD[model];
  if (pricePerMillion === undefined || tokens === null) return null;
  // tokens * (pricePerMillion / 1_000_000) USD * 1_000_000 = tokens * pricePerMillion
  return Math.round(tokens * pricePerMillion);
}

async function callOnce(
  apiKey: string,
  text: string,
  model: string,
  timeoutMs: number
): Promise<{
  vector: number[] | null;
  httpStatus: number | null;
  inputTokens: number | null;
  errorReason: string | null;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, input: text, encoding_format: 'float' }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        vector: null,
        httpStatus: res.status,
        inputTokens: null,
        errorReason: `${res.status}_${body.slice(0, 60).replace(/\s+/g, '_')}`,
      };
    }

    const data: any = await res.json().catch(() => null);
    const vector = data?.data?.[0]?.embedding;
    const inputTokens =
      typeof data?.usage?.prompt_tokens === 'number' ? data.usage.prompt_tokens : null;

    if (!Array.isArray(vector)) {
      return {
        vector: null,
        httpStatus: res.status,
        inputTokens,
        errorReason: 'no_vector_in_response',
      };
    }

    return { vector, httpStatus: res.status, inputTokens, errorReason: null };
  } catch (err) {
    const name = (err as any)?.name ?? '';
    if (name === 'AbortError') {
      return { vector: null, httpStatus: null, inputTokens: null, errorReason: 'timeout' };
    }
    const msg = (err as Error)?.message ?? String(err);
    return {
      vector: null,
      httpStatus: null,
      inputTokens: null,
      errorReason: `exception:${msg.slice(0, 80)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

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

async function logEmbeddingCall(
  req: EmbeddingRequest,
  resp: EmbeddingResponse,
  model: string
): Promise<void> {
  const client = getLogClient();
  if (!client) return;
  try {
    await client.from('llm_calls').insert({
      agent: 'embedding',
      model,
      status: resp.status,
      http_status: resp.httpStatus,
      attempt_count: resp.attempts,
      duration_ms: resp.durationMs,
      input_tokens: resp.inputTokens,
      output_tokens: null,
      cost_usd_micro: resp.costUsdMicro,
      circle_id: req.circleId ?? null,
      error_reason: resp.errorReason,
      metadata: req.metadata ?? null,
    });
  } catch {
    // Observability failures never break the caller.
  }
}

export async function callEmbedding(req: EmbeddingRequest): Promise<EmbeddingResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const model = req.model ?? DEFAULT_MODEL;
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = req.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const startedAt = Date.now();

  if (!apiKey) {
    const resp: EmbeddingResponse = {
      vector: null,
      status: 'exception',
      httpStatus: null,
      attempts: 0,
      durationMs: Date.now() - startedAt,
      inputTokens: null,
      costUsdMicro: null,
      errorReason: 'no_api_key',
    };
    await logEmbeddingCall(req, resp, model);
    return resp;
  }

  let lastHttp: number | null = null;
  let lastReason: string | null = null;
  let lastTokens: number | null = null;
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptsUsed = attempt;
    const r = await callOnce(apiKey, req.text, model, timeoutMs);
    lastHttp = r.httpStatus;
    lastReason = r.errorReason;
    lastTokens = r.inputTokens ?? lastTokens;

    if (r.vector !== null && r.errorReason === null) {
      const cost = computeCostMicro(model, r.inputTokens);
      const resp: EmbeddingResponse = {
        vector: r.vector,
        status: attempt === 1 ? 'ok' : 'retried_ok',
        httpStatus: r.httpStatus,
        attempts: attempt,
        durationMs: Date.now() - startedAt,
        inputTokens: r.inputTokens,
        costUsdMicro: cost,
        errorReason: null,
      };
      await logEmbeddingCall(req, resp, model);
      return resp;
    }

    if (attempt < maxAttempts && shouldRetry(r.httpStatus)) {
      await sleep(backoffMs(attempt));
      continue;
    }
    break;
  }

  let status: EmbeddingStatus = 'http_error';
  if (lastReason === 'timeout') status = 'timeout';
  else if (lastReason && lastReason.startsWith('exception:')) status = 'exception';
  else if (lastReason === 'no_vector_in_response') status = 'parse_error';

  const cost = computeCostMicro(model, lastTokens);
  const resp: EmbeddingResponse = {
    vector: null,
    status,
    httpStatus: lastHttp,
    attempts: attemptsUsed,
    durationMs: Date.now() - startedAt,
    inputTokens: lastTokens,
    costUsdMicro: cost,
    errorReason: lastReason,
  };
  await logEmbeddingCall(req, resp, model);
  return resp;
}

/** Format a number[] vector into pgvector literal "[0.1,0.2,...]" for SQL inserts. */
export function toPgVector(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
