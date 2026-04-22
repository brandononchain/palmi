// Pure-function unit tests for the recap validator + template.
// Run with: deno run validator.test.ts

// ----------------------------------------------------------------------------
// Copy of the validator + template under test. Kept inline so the test file
// has no module-resolution dependency on the edge-function imports (deno std).
// If this drifts from index.ts, the integration test will catch it.
// ----------------------------------------------------------------------------

interface ValidateOk {
  ok: true;
  recap: string;
  tone: 'reflective' | 'playful' | 'quiet';
}
interface ValidateFail { ok: false; reason: string }
type ValidateResult = ValidateOk | ValidateFail;

function validateRecap(raw: string, memberFirstNames: string[]): ValidateResult {
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

  const metricPatterns: RegExp[] = [
    /\b\d+\s*%/,
    /\b\d+\s*(?:posts?|photos?|reactions?|answers?|messages?|replies?|times|members?|days?\s+in\s+a\s+row)\b/i,
    /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:post|reaction|answer)\b/i,
  ];
  for (const pat of metricPatterns) {
    if (pat.test(recap)) return { ok: false, reason: `metric:${pat.source}` };
  }

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

function templateRecap(
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
// Test harness
// ----------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${(e as Error).message}`); failed++; }
}

function assertOk(r: ValidateResult) {
  if (!r.ok) throw new Error(`expected ok=true, got reason=${r.reason}`);
}
function assertReason(r: ValidateResult, expected: string) {
  if (r.ok) throw new Error(`expected rejection ${expected}, got ok=true`);
  if (!r.reason.startsWith(expected)) throw new Error(`expected ${expected}, got ${r.reason}`);
}

// Helper to build a valid-length body around some content.
function withBody(content: string): string {
  // Pad/truncate to land in the 500-1500 range while keeping meaningful text first.
  const filler =
    ' the month had its own rhythm, the kind you only notice when you slow down enough to look. ' +
    'little notes passed between people who already know each other well. nothing more, nothing less. ' +
    'a week turned into the next one without much fanfare. the days stacked. the evenings got shorter. ' +
    'and the group kept its quiet habit of checking in, the way it always does.';
  let out = content + filler;
  while (out.length < 520) out = out + filler;
  return out.slice(0, 1400);
}

const MEMBERS = ['maya', 'jordan', 'sam'];

console.log('RECAP VALIDATOR TESTS');
console.log('');

test('accepts well-formed recap with member mention and valid tone', () => {
  const body = withBody(
    'march had its own shape. maya kept posting little scraps from the coffee shop before class. '
  );
  const r = validateRecap(`{"recap":${JSON.stringify(body)},"tone":"reflective"}`, MEMBERS);
  assertOk(r);
  if (r.ok && r.tone !== 'reflective') throw new Error('tone mismatch');
});

test('strips markdown code fences', () => {
  const body = withBody('march. jordan was steady all month — the usual rhythm. ');
  const raw = '```json\n' + `{"recap":${JSON.stringify(body)},"tone":"quiet"}` + '\n```';
  assertOk(validateRecap(raw, MEMBERS));
});

test('normalizes invalid tone to reflective', () => {
  const body = withBody('march. maya wrote the best thing about an overcast tuesday. ');
  const r = validateRecap(`{"recap":${JSON.stringify(body)},"tone":"ominous"}`, MEMBERS);
  assertOk(r);
  if (r.ok && r.tone !== 'reflective') throw new Error(`expected reflective, got ${r.tone}`);
});

test('accepts all three valid tones', () => {
  for (const tone of ['reflective', 'playful', 'quiet']) {
    const body = withBody(`march. sam showed up often in small ways. `);
    const r = validateRecap(`{"recap":${JSON.stringify(body)},"tone":"${tone}"}`, MEMBERS);
    if (!r.ok || r.tone !== tone) throw new Error(`tone ${tone} failed`);
  }
});

test('rejects non-JSON', () => {
  assertReason(validateRecap('here is the recap: maya was great.', MEMBERS), 'not_valid_json');
});

test('rejects empty recap field', () => {
  assertReason(validateRecap(`{"recap":"","tone":"quiet"}`, MEMBERS), 'empty_recap');
});

test('rejects recap under 500 chars', () => {
  const short = 'march. maya was around. the month was fine.';
  assertReason(validateRecap(`{"recap":${JSON.stringify(short)},"tone":"quiet"}`, MEMBERS), 'too_short');
});

test('rejects recap over 1500 chars', () => {
  const long = 'maya. '.repeat(400); // ~2400 chars, has member mention
  assertReason(validateRecap(`{"recap":${JSON.stringify(long)},"tone":"quiet"}`, MEMBERS), 'too_long');
});

test('rejects recap without any member mention', () => {
  const body = withBody('march. the group kept its quiet rhythm through the whole month. ');
  assertReason(
    validateRecap(`{"recap":${JSON.stringify(body)},"tone":"quiet"}`, MEMBERS),
    'no_member_mentioned'
  );
});

test('rejects recap mentioning palmi', () => {
  const body = withBody('march. maya loves palmi more than anything. ');
  assertReason(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"quiet"}`, MEMBERS), 'forbidden');
});

test('rejects therapeutic language (holding space)', () => {
  const body = withBody('march. maya and jordan kept holding space for one another. ');
  assertReason(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"reflective"}`, MEMBERS), 'forbidden');
});

test('rejects dramatic language (incredible month)', () => {
  const body = withBody('march. it was an incredible month for maya and sam. ');
  assertReason(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"playful"}`, MEMBERS), 'forbidden');
});

test('rejects generic language (great month)', () => {
  const body = withBody('maya and sam had a great month together. ');
  assertReason(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"playful"}`, MEMBERS), 'forbidden');
});

test('rejects streak mentions', () => {
  const body = withBody('march. maya was on a posting streak through the middle weeks. ');
  assertReason(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"playful"}`, MEMBERS), 'forbidden');
});

test('rejects photo description (in the picture)', () => {
  const body = withBody('march. maya laughing in the picture by the window. ');
  assertReason(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"playful"}`, MEMBERS), 'forbidden');
});

test('rejects post-count metric (7 posts)', () => {
  const body = withBody('march. maya shared 7 posts across the second week. ');
  assertReason(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"playful"}`, MEMBERS), 'metric');
});

test('rejects percentage metric', () => {
  const body = withBody('march. maya answered 80% of the daily questions. ');
  assertReason(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"playful"}`, MEMBERS), 'metric');
});

test('rejects ordinal metric (third post)', () => {
  const body = withBody('march. maya\'s third post of the month was the highlight. ');
  assertReason(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"reflective"}`, MEMBERS), 'metric');
});

test('rejects "days in a row" streak metric', () => {
  const body = withBody('march. maya answered 12 days in a row without missing. ');
  assertReason(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"playful"}`, MEMBERS), 'metric');
});

test('allows a harmless year number (not paired with a tracked unit)', () => {
  const body = withBody('march 2026 felt quieter than the one before. maya noticed it too. ');
  assertOk(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"reflective"}`, MEMBERS));
});

test('member match is case-insensitive and whole-word', () => {
  const body = withBody('march. MAYA was everywhere this month, in the best way. ');
  assertOk(validateRecap(`{"recap":${JSON.stringify(body)},"tone":"playful"}`, MEMBERS));
});

test('member match does not count substrings (samantha ≠ sam)', () => {
  const body = withBody('march. samantha was quiet this month, no one else came through. ');
  // "sam" as whole word shouldn't match "samantha"
  assertReason(
    validateRecap(`{"recap":${JSON.stringify(body)},"tone":"quiet"}`, ['sam']),
    'no_member_mentioned'
  );
});

console.log('');
console.log('TEMPLATE TESTS');
console.log('');

test('template produces a 500-1500 char body', () => {
  const { recap } = templateRecap('March 2026', ['maya', 'jordan', 'sam']);
  if (recap.length < 500 || recap.length > 1500) {
    throw new Error(`length out of range: ${recap.length}`);
  }
});

test('template passes the validator with its own roster', () => {
  const names = ['maya', 'jordan', 'sam'];
  const { recap, tone } = templateRecap('March 2026', names);
  const r = validateRecap(`{"recap":${JSON.stringify(recap)},"tone":"${tone}"}`, names);
  if (!r.ok) throw new Error(`template failed validator: ${r.reason}`);
});

test('template handles a single-member circle', () => {
  const names = ['alex'];
  const { recap } = templateRecap('April 2026', names);
  const r = validateRecap(`{"recap":${JSON.stringify(recap)},"tone":"quiet"}`, names);
  if (!r.ok) throw new Error(`single-member template failed: ${r.reason}`);
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  // @ts-ignore
  if (typeof Deno !== 'undefined') Deno.exit(1);
  else process.exit(1);
}
