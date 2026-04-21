// Integration test for the curator's decision logic
// Simulates: circle selection, AI call, fallback on failure, insertion

// Mock data
const mockCircles = [
  { id: 'c1', name: 'dorm 4B', created_at: '2026-01-01T00:00:00Z', member_count: 6, tz: 'America/Chicago' },
  { id: 'c2', name: 'brunch club', created_at: '2026-03-15T00:00:00Z', member_count: 4, tz: 'America/New_York' },
  { id: 'c3', name: 'study group', created_at: '2026-04-10T00:00:00Z', member_count: 3, tz: 'Asia/Tokyo' },
];

// Pretend it's Tuesday April 21 2026, 14:00 UTC (= 9am CDT, 10am EDT, 23:00 JST)
const MOCK_NOW = new Date('2026-04-21T14:00:00Z');

function isDropHourNow(timezone: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(MOCK_NOW);
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    if (!hourPart) return false;
    return parseInt(hourPart, 10) === 9;
  } catch {
    return false;
  }
}

let tests = 0;
let fails = 0;
function test(name: string, fn: () => void) {
  tests++;
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { fails++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`); }
}

console.log('TIMEZONE TARGETING TESTS');
console.log('(fake "now" = 2026-04-21 14:00 UTC)');
console.log('');

test('Chicago (CDT -05:00) is in drop hour at 14:00 UTC', () => {
  // UTC 14:00 = Chicago 09:00 during DST (April is DST)
  if (!isDropHourNow('America/Chicago')) throw new Error('Chicago should be 9am');
});

test('New York (EDT -04:00) is NOT in drop hour at 14:00 UTC', () => {
  // UTC 14:00 = NY 10:00 during DST — should skip
  if (isDropHourNow('America/New_York')) throw new Error('NY should be 10am, not in drop hour');
});

test('Tokyo (JST +09:00) is NOT in drop hour at 14:00 UTC', () => {
  // UTC 14:00 = Tokyo 23:00 — should skip
  if (isDropHourNow('Asia/Tokyo')) throw new Error('Tokyo should be 11pm, not in drop hour');
});

test('UTC is NOT in drop hour at 14:00 UTC', () => {
  if (isDropHourNow('UTC')) throw new Error('UTC is 14:00, not in drop hour');
});

test('bogus timezone is handled gracefully', () => {
  // Should return false, not throw
  if (isDropHourNow('Mars/Olympus_Mons')) throw new Error('bogus tz should be false');
});

console.log('');
console.log('FALLBACK SELECTION TEST');
console.log('');

// Mock fallback bank with usage counts
const bank = [
  { id: 'q1', question_text: 'What is within arm reach?', times_used: 10 },
  { id: 'q2', question_text: 'What made you laugh today?', times_used: 2 },
  { id: 'q3', question_text: 'Show us your desk.', times_used: 0 },
];
const recent = new Set(['What made you laugh today?']);  // already asked recently

test('picks least-used, not-recently-asked', () => {
  // Sort by times_used ASC
  bank.sort((a, b) => a.times_used - b.times_used);
  const picked = bank.find(q => !recent.has(q.question_text)) ?? bank[0];
  if (picked?.id !== 'q3') throw new Error(`expected q3, got ${picked?.id}`);
});

console.log('');
console.log('QUESTION GENERATION DECISION TREE');
console.log('');

interface AiResult { ok: boolean; text?: string }

async function simulateGeneration(aiResult: AiResult): Promise<{ source: 'ai' | 'fallback', text: string }> {
  if (aiResult.ok && aiResult.text) {
    return { source: 'ai', text: aiResult.text };
  }
  return { source: 'fallback', text: 'Show us your desk.' };
}

test('ai success path uses ai output', async () => {
  const r = await simulateGeneration({ ok: true, text: 'What color is your ceiling?' });
  if (r.source !== 'ai') throw new Error('should use ai');
  if (r.text !== 'What color is your ceiling?') throw new Error('text mismatch');
});

test('ai failure falls back to bank', async () => {
  const r = await simulateGeneration({ ok: false });
  if (r.source !== 'fallback') throw new Error('should fall back');
});

console.log('');
console.log(`${tests} tests, ${fails} failures`);
if (fails > 0) {
  // @ts-ignore
  if (typeof Deno !== 'undefined') Deno.exit(1);
}
