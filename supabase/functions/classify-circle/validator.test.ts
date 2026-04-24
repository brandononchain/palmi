// Pure-function unit tests for the circle classifier validator.
// Run with: deno test validator.test.ts
//
// Mirrors the style of curate-question/validator.test.ts: copies the
// validator inline so we don't need module resolution for shared types.

type CirclePurpose =
  | 'friends'
  | 'study'
  | 'professional'
  | 'interest'
  | 'wellness'
  | 'creator'
  | 'local'
  | 'other';

interface Classification {
  purpose: CirclePurpose;
  audience: 'campus' | 'young_adult' | 'professional' | 'mixed';
  subtopics: string[];
  vibe_keywords: string[];
  summary: string;
}

const VALID_PURPOSES = new Set<string>([
  'friends',
  'study',
  'professional',
  'interest',
  'wellness',
  'creator',
  'local',
  'other',
]);
const VALID_AUDIENCES = new Set(['campus', 'young_adult', 'professional', 'mixed']);

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

function validateClassification(
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
    },
  };
}

// Minimal test runner ---------------------------------------------------------
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${(e as Error).message}`);
    failed++;
  }
}

function assertOk(r: ReturnType<typeof validateClassification>) {
  if (!r.ok) throw new Error(`expected ok=true, got reason=${r.reason}`);
}
function assertReason(r: ReturnType<typeof validateClassification>, prefix: string) {
  if (r.ok) throw new Error(`expected rejection (${prefix}), got ok=true`);
  if (!r.reason.startsWith(prefix)) throw new Error(`expected reason ${prefix}, got ${r.reason}`);
}

console.log('CLASSIFIER VALIDATOR TESTS');

test('accepts well-formed friends classification', () => {
  const r = validateClassification(
    `{"purpose":"friends","audience":"young_adult","subtopics":[],"vibe_keywords":["playful"],"summary":"A small group of college friends sharing daily moments."}`
  );
  assertOk(r);
  if (r.ok && r.value.purpose !== 'friends') throw new Error('purpose mismatch');
});

test('strips markdown code fences', () => {
  const r = validateClassification(
    '```json\n{"purpose":"study","audience":"campus","subtopics":["biology","mcat-prep"],"vibe_keywords":["accountability"],"summary":"A premed study group prepping together."}\n```'
  );
  assertOk(r);
  if (r.ok && r.value.subtopics.length !== 2) throw new Error('subtopics not parsed');
});

test('rejects unknown purpose', () => {
  assertReason(
    validateClassification(
      `{"purpose":"investing","audience":"professional","subtopics":[],"vibe_keywords":[],"summary":"x"}`
    ),
    'bad_purpose'
  );
});

test('rejects unknown audience', () => {
  assertReason(
    validateClassification(
      `{"purpose":"friends","audience":"teens","subtopics":[],"vibe_keywords":[],"summary":"x"}`
    ),
    'bad_audience'
  );
});

test('rejects empty summary', () => {
  assertReason(
    validateClassification(
      `{"purpose":"friends","audience":"mixed","subtopics":[],"vibe_keywords":[],"summary":""}`
    ),
    'empty_summary'
  );
});

test('rejects oversized summary', () => {
  const longSummary = 'x'.repeat(281);
  assertReason(
    validateClassification(
      `{"purpose":"friends","audience":"mixed","subtopics":[],"vibe_keywords":[],"summary":"${longSummary}"}`
    ),
    'summary_too_long'
  );
});

test('rejects malformed JSON', () => {
  assertReason(validateClassification('not json'), 'not_valid_json');
});

test('caps subtopics at 5 items', () => {
  const r = validateClassification(
    `{"purpose":"interest","audience":"mixed","subtopics":["a","b","c","d","e","f","g"],"vibe_keywords":[],"summary":"x"}`
  );
  assertOk(r);
  if (r.ok && r.value.subtopics.length !== 5) throw new Error('subtopics not capped');
});

test('dedupes and lowercases subtopics', () => {
  const r = validateClassification(
    `{"purpose":"interest","audience":"mixed","subtopics":["BIOLOGY","biology","Biology"],"vibe_keywords":[],"summary":"x"}`
  );
  assertOk(r);
  if (r.ok && (r.value.subtopics.length !== 1 || r.value.subtopics[0] !== 'biology')) {
    throw new Error('dedupe/lowercase failed');
  }
});

test('drops over-long individual subtopic items', () => {
  const tooLong = 'x'.repeat(33);
  const r = validateClassification(
    `{"purpose":"interest","audience":"mixed","subtopics":["${tooLong}","ok"],"vibe_keywords":[],"summary":"x"}`
  );
  assertOk(r);
  if (r.ok && (r.value.subtopics.length !== 1 || r.value.subtopics[0] !== 'ok')) {
    throw new Error('length filter failed');
  }
});

test('handles non-array subtopics gracefully', () => {
  const r = validateClassification(
    `{"purpose":"friends","audience":"mixed","subtopics":"not an array","vibe_keywords":null,"summary":"x"}`
  );
  assertOk(r);
  if (r.ok && (r.value.subtopics.length !== 0 || r.value.vibe_keywords.length !== 0)) {
    throw new Error('expected empty arrays for bad input');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // @ts-ignore deno globals
  Deno.exit(1);
}
