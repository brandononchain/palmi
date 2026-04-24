// Pure-function unit tests for screen-join-request validators.
// Run with: deno test validator.test.ts

type Recommendation = 'safe_auto_approve' | 'needs_owner_review' | 'reject';
interface ScreeningOutput {
  recommendation: Recommendation;
  reason: string;
}

const VALID_RECS: Recommendation[] = ['safe_auto_approve', 'needs_owner_review', 'reject'];

function parseScreeningJson(raw: string): ScreeningOutput | null {
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
  return { recommendation: rec as Recommendation, reason: reason.slice(0, 240) };
}

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

console.log('SCREEN-JOIN-REQUEST VALIDATOR TESTS');

test('accepts safe_auto_approve', () => {
  const r = parseScreeningJson(
    `{"recommendation":"safe_auto_approve","reason":"intent matches study purpose, specific and sincere"}`
  );
  if (!r) throw new Error('expected parsed');
  assertEq(r.recommendation, 'safe_auto_approve', 'rec');
});

test('accepts needs_owner_review', () => {
  const r = parseScreeningJson(
    `{"recommendation":"needs_owner_review","reason":"vague intent, low signal"}`
  );
  if (!r) throw new Error('expected parsed');
  assertEq(r.recommendation, 'needs_owner_review', 'rec');
});

test('accepts reject', () => {
  const r = parseScreeningJson(
    `{"recommendation":"reject","reason":"contains spam links and unrelated solicitation"}`
  );
  if (!r) throw new Error('expected parsed');
  assertEq(r.recommendation, 'reject', 'rec');
});

test('strips ```json fences', () => {
  const r = parseScreeningJson(
    '```json\n{"recommendation":"reject","reason":"clear harassment"}\n```'
  );
  if (!r) throw new Error('expected parsed');
  assertEq(r.recommendation, 'reject', 'rec');
});

test('rejects invalid recommendation enum', () => {
  if (parseScreeningJson(`{"recommendation":"approve","reason":"x"}`) !== null) {
    throw new Error('expected null');
  }
});

test('rejects missing reason', () => {
  if (parseScreeningJson(`{"recommendation":"reject","reason":""}`) !== null) {
    throw new Error('expected null on empty reason');
  }
  if (parseScreeningJson(`{"recommendation":"reject"}`) !== null) {
    throw new Error('expected null on missing reason');
  }
});

test('truncates long reason at 240 chars', () => {
  const long = 'x'.repeat(500);
  const r = parseScreeningJson(
    JSON.stringify({ recommendation: 'needs_owner_review', reason: long })
  );
  if (!r) throw new Error('expected parsed');
  assertEq(r.reason.length, 240, 'reason truncated');
});

test('returns null on invalid JSON', () => {
  if (parseScreeningJson('not json') !== null) throw new Error('expected null');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // @ts-ignore
  Deno.exit(1);
}
