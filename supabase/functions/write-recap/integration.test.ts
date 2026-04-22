// Integration test for the recap writer's decision logic.
// Simulates circle selection, period math, AI success/fail, and insertion path.
// Run with: deno run integration.test.ts

// ----------------------------------------------------------------------------
// Local copies of the timezone/period helpers under test.
// ----------------------------------------------------------------------------
const RUN_HOUR_LOCAL = 9;

function localPartsInTz(
  timezone: string,
  now: Date
): { hour: number; day: number; year: number; month: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      day: 'numeric',
      year: 'numeric',
      month: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const hour = parseInt(get('hour') ?? '', 10);
    const day = parseInt(get('day') ?? '', 10);
    const year = parseInt(get('year') ?? '', 10);
    const month = parseInt(get('month') ?? '', 10);
    if ([hour, day, year, month].some((n) => Number.isNaN(n))) return null;
    return { hour, day, year, month };
  } catch {
    return null;
  }
}

function shouldRunForCircle(timezone: string, now: Date): boolean {
  const parts = localPartsInTz(timezone, now);
  if (!parts) return false;
  return parts.hour === RUN_HOUR_LOCAL && parts.day === 1;
}

function priorMonthPeriod(
  timezone: string,
  now: Date
): { start: string; end: string; label: string } | null {
  const parts = localPartsInTz(timezone, now);
  if (!parts) return null;
  let year = parts.year;
  let month = parts.month - 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${year}-${mm}-01`;
  const end = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return { start, end, label };
}

// ----------------------------------------------------------------------------
// Harness
// ----------------------------------------------------------------------------
let tests = 0;
let fails = 0;
function test(name: string, fn: () => void | Promise<void>) {
  tests++;
  const run = () => {
    try {
      const r = fn();
      if (r instanceof Promise) return r.then(
        () => console.log(`  PASS  ${name}`),
        (e) => { fails++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`); }
      );
      console.log(`  PASS  ${name}`);
    } catch (e) {
      fails++;
      console.log(`  FAIL  ${name}\n        ${(e as Error).message}`);
    }
  };
  return run();
}

// ----------------------------------------------------------------------------
// Timezone targeting
// ----------------------------------------------------------------------------
console.log('SHOULD-RUN GATE');
console.log('');

// Chicago is UTC-5 in April (DST). 2026-05-01 14:00 UTC = 2026-05-01 09:00 CDT.
const MAY_1_CHICAGO_9AM = new Date('2026-05-01T14:00:00Z');
// Same moment, but Tokyo sees 2026-05-01 23:00 — wrong hour.
// NY (EDT -4) sees 10:00 — wrong hour.

test('Chicago at local 09:00 on the 1st: runs', () => {
  if (!shouldRunForCircle('America/Chicago', MAY_1_CHICAGO_9AM)) throw new Error('should run');
});

test('New York at local 10:00 on the 1st: does not run (wrong hour)', () => {
  if (shouldRunForCircle('America/New_York', MAY_1_CHICAGO_9AM)) throw new Error('should skip');
});

test('Tokyo at local 23:00 on the 1st: does not run', () => {
  if (shouldRunForCircle('Asia/Tokyo', MAY_1_CHICAGO_9AM)) throw new Error('should skip');
});

test('UTC at 14:00 on the 1st: does not run', () => {
  if (shouldRunForCircle('UTC', MAY_1_CHICAGO_9AM)) throw new Error('should skip');
});

// Mid-month: 09:00 local but not the 1st.
const APR_15_CHICAGO_9AM = new Date('2026-04-15T14:00:00Z');
test('Chicago at 09:00 on the 15th: does not run (wrong day)', () => {
  if (shouldRunForCircle('America/Chicago', APR_15_CHICAGO_9AM)) throw new Error('should skip');
});

test('bogus timezone is handled gracefully', () => {
  if (shouldRunForCircle('Mars/Olympus', MAY_1_CHICAGO_9AM)) throw new Error('bogus tz should be false');
});

// ----------------------------------------------------------------------------
// Prior-month period math
// ----------------------------------------------------------------------------
console.log('');
console.log('PRIOR MONTH PERIOD');
console.log('');

test('May 1 → April period', () => {
  const p = priorMonthPeriod('America/Chicago', MAY_1_CHICAGO_9AM);
  if (!p) throw new Error('null');
  if (p.start !== '2026-04-01') throw new Error(`start: ${p.start}`);
  if (p.end !== '2026-04-30') throw new Error(`end: ${p.end}`);
  if (p.label !== 'April 2026') throw new Error(`label: ${p.label}`);
});

test('January 1 → prior December of prior year', () => {
  // 2026-01-01 14:00 UTC = 2026-01-01 08:00 CST (no DST). Use 15:00 UTC for 09:00 CST.
  const jan1 = new Date('2026-01-01T15:00:00Z');
  const p = priorMonthPeriod('America/Chicago', jan1);
  if (!p) throw new Error('null');
  if (p.start !== '2025-12-01') throw new Error(`start: ${p.start}`);
  if (p.end !== '2025-12-31') throw new Error(`end: ${p.end}`);
  if (p.label !== 'December 2025') throw new Error(`label: ${p.label}`);
});

test('March 1 → February period with correct last day (28 in 2026)', () => {
  const mar1 = new Date('2026-03-01T15:00:00Z');
  const p = priorMonthPeriod('America/Chicago', mar1);
  if (!p) throw new Error('null');
  if (p.start !== '2026-02-01') throw new Error(`start: ${p.start}`);
  if (p.end !== '2026-02-28') throw new Error(`end: ${p.end}`);
});

test('March 1 2024 → February leap day (29)', () => {
  const mar1 = new Date('2024-03-01T15:00:00Z');
  const p = priorMonthPeriod('America/Chicago', mar1);
  if (!p) throw new Error('null');
  if (p.end !== '2024-02-29') throw new Error(`expected 02-29, got ${p.end}`);
});

// ----------------------------------------------------------------------------
// End-to-end decision flow with a mock Supabase client.
// Exercises: gate → idempotency → AI success → AI failure → insert shape.
// ----------------------------------------------------------------------------
console.log('');
console.log('DECISION FLOW');
console.log('');

interface FakeCircle {
  id: string;
  name: string;
  tz: string;
  hasExistingRecap: boolean;
  members: { user_id: string; display_name: string }[];
}

interface FakeAi {
  text: string | null; // null = API failure; else raw JSON
}

interface Insert {
  circle_id: string;
  period_start: string;
  body: string;
  source: 'ai' | 'template';
}

function runDecision(
  circle: FakeCircle,
  now: Date,
  ai: FakeAi,
  validate: (raw: string, names: string[]) => { ok: boolean; recap?: string },
  template: (label: string, names: string[]) => string
): { action: 'skip_hour' | 'skip_day' | 'skip_existing' | 'wrote'; insert?: Insert; source?: string } {
  if (!shouldRunForCircle(circle.tz, now)) {
    const parts = localPartsInTz(circle.tz, now);
    return { action: parts && parts.day !== 1 ? 'skip_day' : 'skip_hour' };
  }
  const period = priorMonthPeriod(circle.tz, now);
  if (!period) return { action: 'skip_hour' };
  if (circle.hasExistingRecap) return { action: 'skip_existing' };

  const names = circle.members.map((m) => m.display_name.split(/\s+/)[0] ?? '');

  let body: string;
  let source: 'ai' | 'template';
  if (ai.text) {
    const v = validate(ai.text, names);
    if (v.ok && v.recap) {
      body = v.recap;
      source = 'ai';
    } else {
      body = template(period.label, names);
      source = 'template';
    }
  } else {
    body = template(period.label, names);
    source = 'template';
  }

  return {
    action: 'wrote',
    source,
    insert: { circle_id: circle.id, period_start: period.start, body, source },
  };
}

// Fake validator/template stubs (we trust the real ones via validator.test.ts).
function fakeValidate(raw: string, names: string[]): { ok: boolean; recap?: string } {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.recap !== 'string' || parsed.recap.length < 500) return { ok: false };
    if (!names.some((n) => n && new RegExp(`\\b${n}\\b`, 'i').test(parsed.recap))) return { ok: false };
    return { ok: true, recap: parsed.recap };
  } catch {
    return { ok: false };
  }
}

function fakeTemplate(label: string, names: string[]): string {
  return 'x'.repeat(600) + ' ' + (names[0] ?? '') + ' ' + label;
}

const circle: FakeCircle = {
  id: 'c1',
  name: 'dorm 4B',
  tz: 'America/Chicago',
  hasExistingRecap: false,
  members: [
    { user_id: 'u1', display_name: 'Maya Patel' },
    { user_id: 'u2', display_name: 'Jordan Lee' },
  ],
};

test('skips when not the 1st of the month', () => {
  const r = runDecision(circle, APR_15_CHICAGO_9AM, { text: null }, fakeValidate, fakeTemplate);
  if (r.action !== 'skip_day') throw new Error(`expected skip_day, got ${r.action}`);
});

test('skips when hour is wrong', () => {
  // May 1 at 10:00 CDT = 15:00 UTC
  const wrongHour = new Date('2026-05-01T15:00:00Z');
  const r = runDecision(circle, wrongHour, { text: null }, fakeValidate, fakeTemplate);
  if (r.action !== 'skip_hour') throw new Error(`expected skip_hour, got ${r.action}`);
});

test('skips when recap already exists', () => {
  const r = runDecision(
    { ...circle, hasExistingRecap: true },
    MAY_1_CHICAGO_9AM,
    { text: null },
    fakeValidate,
    fakeTemplate
  );
  if (r.action !== 'skip_existing') throw new Error(`expected skip_existing, got ${r.action}`);
});

test('uses AI output when validation passes', () => {
  const validRecap = 'x'.repeat(600) + ' Maya was quietly present the whole month.';
  const r = runDecision(
    circle,
    MAY_1_CHICAGO_9AM,
    { text: JSON.stringify({ recap: validRecap, tone: 'quiet' }) },
    fakeValidate,
    fakeTemplate
  );
  if (r.action !== 'wrote' || r.source !== 'ai') throw new Error(`expected wrote/ai, got ${r.action}/${r.source}`);
  if (r.insert?.period_start !== '2026-04-01') throw new Error(`period_start: ${r.insert?.period_start}`);
});

test('falls back to template when AI returns null', () => {
  const r = runDecision(circle, MAY_1_CHICAGO_9AM, { text: null }, fakeValidate, fakeTemplate);
  if (r.action !== 'wrote' || r.source !== 'template') throw new Error(`expected template, got ${r.source}`);
});

test('falls back to template when AI output fails validation', () => {
  const bad = JSON.stringify({ recap: 'too short', tone: 'quiet' });
  const r = runDecision(circle, MAY_1_CHICAGO_9AM, { text: bad }, fakeValidate, fakeTemplate);
  if (r.action !== 'wrote' || r.source !== 'template') throw new Error(`expected template, got ${r.source}`);
});

test('insert shape carries circle_id, period_start, body, and source', () => {
  const validRecap = 'y'.repeat(600) + ' Maya made tuesdays feel lighter.';
  const r = runDecision(
    circle,
    MAY_1_CHICAGO_9AM,
    { text: JSON.stringify({ recap: validRecap, tone: 'reflective' }) },
    fakeValidate,
    fakeTemplate
  );
  if (!r.insert) throw new Error('no insert');
  const required: (keyof Insert)[] = ['circle_id', 'period_start', 'body', 'source'];
  for (const k of required) {
    if (r.insert[k] == null) throw new Error(`missing ${k}`);
  }
  if (r.insert.circle_id !== 'c1') throw new Error('circle mismatch');
});

console.log('');
console.log(`${tests} tests, ${fails} failures`);
if (fails > 0) {
  // @ts-ignore
  if (typeof Deno !== 'undefined') Deno.exit(1);
}
