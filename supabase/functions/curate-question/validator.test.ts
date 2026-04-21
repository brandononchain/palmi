// Pure-function unit tests for the question validator.
// Run with: deno test validator.test.ts

// Extract the validator for testing (copy so we don't need module resolution in test)
function validateQuestion(raw: string): { ok: true; text: string; tag: string } | { ok: false; reason: string } {
  let parsed: any;
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, reason: 'not_valid_json' };
  }

  const text = typeof parsed.question === 'string' ? parsed.question.trim() : '';
  const tag = typeof parsed.tag === 'string' ? parsed.tag.trim() : '';

  if (!text) return { ok: false, reason: 'empty_question' };
  if (text.length < 5 || text.length > 200) return { ok: false, reason: 'length_out_of_range' };
  if (text.length > 100) return { ok: false, reason: 'too_long_soft_limit' };
  if (!/[?.]$/.test(text)) return { ok: false, reason: 'bad_punctuation' };

  const forbidden = [
    /\bpalmi\b/i,
    /\bcircle\b/i,
    /\bthe app\b/i,
    /\bfavorite\b/i,
    /\brate\b.*\b1-?10\b/i,
    /\bpolitic/i,
    /\breligio/i,
  ];
  for (const pat of forbidden) {
    if (pat.test(text)) return { ok: false, reason: `forbidden_word:${pat.source}` };
  }

  const validTags = ['sensory', 'memory', 'playful', 'reflective', 'specific', 'sharing'];
  const finalTag = validTags.includes(tag) ? tag : 'reflective';

  return { ok: true, text, tag: finalTag };
}

// Minimal test runner since deno's std test is another import
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

function assertOk(r: ReturnType<typeof validateQuestion>) {
  if (!r.ok) throw new Error(`expected ok=true, got reason=${r.reason}`);
}
function assertReason(r: ReturnType<typeof validateQuestion>, expected: string) {
  if (r.ok) throw new Error(`expected rejection for reason ${expected}, got ok=true`);
  if (!r.reason.startsWith(expected)) throw new Error(`expected reason ${expected}, got ${r.reason}`);
}

console.log('VALIDATOR TESTS');

test('accepts well-formed JSON with valid question', () => {
  const r = validateQuestion(`{"question":"What's within arm's reach right now?","tag":"sensory"}`);
  assertOk(r);
  if (r.ok && r.tag !== 'sensory') throw new Error('tag mismatch');
});

test('strips markdown code fences', () => {
  const r = validateQuestion("```json\n{\"question\":\"What made you laugh today?\",\"tag\":\"memory\"}\n```");
  assertOk(r);
});

test('accepts imperative ending with period', () => {
  assertOk(validateQuestion(`{"question":"Show us what you're eating for lunch.","tag":"sharing"}`));
});

test('rejects non-JSON', () => {
  assertReason(validateQuestion('Here is a question: What did you do today?'), 'not_valid_json');
});

test('rejects empty question field', () => {
  assertReason(validateQuestion(`{"question":"","tag":"memory"}`), 'empty_question');
});

test('rejects question over 200 chars', () => {
  const long = 'a'.repeat(201);
  assertReason(validateQuestion(`{"question":"${long}?","tag":"memory"}`), 'length_out_of_range');
});

test('rejects question over soft 100-char limit', () => {
  const long = 'a'.repeat(101);
  assertReason(validateQuestion(`{"question":"${long}?","tag":"memory"}`), 'too_long_soft_limit');
});

test('rejects question without ending punctuation', () => {
  assertReason(validateQuestion(`{"question":"What did you have for breakfast","tag":"memory"}`), 'bad_punctuation');
});

test('rejects question mentioning palmi', () => {
  assertReason(validateQuestion(`{"question":"What is your favorite thing about palmi?","tag":"reflective"}`), 'forbidden_word');
});

test('rejects question mentioning circle', () => {
  assertReason(validateQuestion(`{"question":"Who in your circle are you closest to?","tag":"reflective"}`), 'forbidden_word');
});

test('rejects "favorite" question', () => {
  assertReason(validateQuestion(`{"question":"What is your favorite color?","tag":"playful"}`), 'forbidden_word');
});

test('rejects rate 1-10 question', () => {
  assertReason(validateQuestion(`{"question":"Rate your day 1-10 today.","tag":"reflective"}`), 'forbidden_word');
});

test('rejects political question', () => {
  assertReason(validateQuestion(`{"question":"What do you think about the politics today?","tag":"reflective"}`), 'forbidden_word');
});

test('normalizes invalid tag to reflective', () => {
  const r = validateQuestion(`{"question":"What does the ceiling above you look like?","tag":"cursed"}`);
  assertOk(r);
  if (r.ok && r.tag !== 'reflective') throw new Error(`expected reflective, got ${r.tag}`);
});

test('accepts all six valid tags', () => {
  const tags = ['sensory', 'memory', 'playful', 'reflective', 'specific', 'sharing'];
  for (const tag of tags) {
    const r = validateQuestion(`{"question":"What's in your pocket?","tag":"${tag}"}`);
    if (!r.ok || r.tag !== tag) throw new Error(`tag ${tag} failed`);
  }
});

test('accepts real examples from the human bank', () => {
  const examples = [
    "What's within arm's reach of you right now?",
    'What made you laugh yesterday?',
    "What's the last thing you ate and was it a good decision?",
    'First thing you touched this morning that was not your phone?',
    "What's on your desk right now?",
    'Post a photo from a walk you took this week.',
  ];
  for (const q of examples) {
    const r = validateQuestion(`{"question":"${q}","tag":"sensory"}`);
    if (!r.ok) throw new Error(`expected ok for: "${q}", got reason=${r.reason}`);
  }
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  // @ts-ignore
  if (typeof Deno !== 'undefined') Deno.exit(1);
  else process.exit(1);
}
