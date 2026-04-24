// Pure-function unit tests for discover-circles validators.
// Run with: deno test validator.test.ts
//
// Mirrors classify-circle/validator.test.ts: copies the validators inline so
// no module resolution is required, and uses a tiny home-grown test runner
// (no deno std/test imports — we want this to run anywhere Deno is on PATH).

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

interface ParsedIntent {
  purpose: Purpose | null;
  audience: string | null;
  subtopics: string[];
  constraints: string[];
}

interface RankerScore {
  circle_id: string;
  fit: number;
  fit_reason: string;
}

function validateQuery(q: unknown): string | null {
  if (typeof q !== 'string') return null;
  const trimmed = q.trim();
  if (trimmed.length < 1 || trimmed.length > 500) return null;
  return trimmed;
}

function parseIntentJson(raw: string): ParsedIntent | null {
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

function parseRankerJson(raw: string): RankerScore[] | null {
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
function assertEq<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

console.log('DISCOVER-CIRCLES VALIDATOR TESTS');

test('rejects empty query', () => {
  if (validateQuery('') !== null) throw new Error('expected null for empty');
  if (validateQuery('   ') !== null) throw new Error('expected null for whitespace');
});

test('rejects non-string query', () => {
  if (validateQuery(123 as any) !== null) throw new Error('expected null for number');
  if (validateQuery(null) !== null) throw new Error('expected null for null');
});

test('rejects oversized query', () => {
  const long = 'a'.repeat(501);
  if (validateQuery(long) !== null) throw new Error('expected null for >500 chars');
});

test('trims and accepts valid query', () => {
  const r = validateQuery('  find me a biology study group  ');
  assertEq(r, 'find me a biology study group', 'trimmed query');
});

test('parses well-formed intent', () => {
  const r = parseIntentJson(
    `{"purpose":"study","audience":"premed undergrads","subtopics":["mcat","biology"],"constraints":["small group"]}`
  );
  if (!r) throw new Error('expected parsed intent');
  assertEq(r.purpose, 'study', 'purpose');
  assertEq(r.audience, 'premed undergrads', 'audience');
  assertEq(r.subtopics.length, 2, 'subtopics length');
  assertEq(r.constraints[0], 'small group', 'constraint');
});

test('strips ```json fences from intent', () => {
  const r = parseIntentJson(
    '```json\n{"purpose":"interest","audience":null,"subtopics":["tarot"],"constraints":[]}\n```'
  );
  if (!r) throw new Error('expected parsed');
  assertEq(r.purpose, 'interest', 'purpose');
  assertEq(r.subtopics[0], 'tarot', 'subtopic');
});

test('nulls invalid purpose', () => {
  const r = parseIntentJson(`{"purpose":"crypto","audience":null,"subtopics":[],"constraints":[]}`);
  if (!r) throw new Error('expected parsed');
  assertEq(r.purpose, null, 'invalid purpose nulled');
});

test('caps subtopics at 8 and length 40', () => {
  const tags = Array.from({ length: 12 }, (_, i) => `topic${i}`);
  const r = parseIntentJson(JSON.stringify({ purpose: 'mixed', subtopics: tags }));
  if (!r) throw new Error('expected parsed');
  assertEq(r.subtopics.length, 8, 'subtopics capped');
  const longTopic = 'x'.repeat(80);
  const r2 = parseIntentJson(JSON.stringify({ purpose: 'mixed', subtopics: [longTopic] }));
  if (!r2) throw new Error('expected parsed');
  assertEq(r2.subtopics[0].length, 40, 'subtopic truncated');
});

test('returns null on bad JSON', () => {
  if (parseIntentJson('not json at all') !== null) throw new Error('expected null');
});

test('parses ranker array', () => {
  const r = parseRankerJson(
    `[{"circle_id":"c1","fit":92,"fit_reason":"strong topical fit"},{"circle_id":"c2","fit":40,"fit_reason":"different audience"}]`
  );
  if (!r) throw new Error('expected ranker scores');
  assertEq(r.length, 2, 'two scores');
  assertEq(r[0].fit, 92, 'first fit');
});

test('clamps ranker fit to 0..100', () => {
  const r = parseRankerJson(
    `[{"circle_id":"c1","fit":150,"fit_reason":"x"},{"circle_id":"c2","fit":-20,"fit_reason":"y"}]`
  );
  if (!r) throw new Error('expected scores');
  assertEq(r[0].fit, 100, 'clamped high');
  assertEq(r[1].fit, 0, 'clamped low');
});

test('skips ranker rows missing fields', () => {
  const r = parseRankerJson(
    `[{"circle_id":"c1","fit":50,"fit_reason":"ok"},{"circle_id":"c2","fit_reason":"missing fit"},{"fit":80,"fit_reason":"missing id"}]`
  );
  if (!r) throw new Error('expected scores');
  assertEq(r.length, 1, 'only valid row kept');
});

test('accepts ranker wrapped in {results: [...]}', () => {
  const r = parseRankerJson(
    `{"results":[{"circle_id":"c1","fit":70,"fit_reason":"warm overlap"}]}`
  );
  if (!r) throw new Error('expected scores');
  assertEq(r.length, 1, 'unwrapped');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // @ts-ignore
  Deno.exit(1);
}
