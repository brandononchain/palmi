// Live smoke test — calls the real Anthropic API with your key.
// Run: ANTHROPIC_API_KEY=sk-ant-... deno run --allow-net --allow-env smoke_live.ts
//
// This is the "does the AI actually produce acceptable questions" check.
// Generates 10 questions and shows which pass/fail validation.

const API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
if (!API_KEY) {
  console.log('Skipped — set ANTHROPIC_API_KEY to run this test');
  Deno.exit(0);
}

const SYSTEM_PROMPT = `You write the daily question for palmi, a small-circle social app for close friends. A "circle" is 2-15 people who know each other well.

Your job is to write ONE question that members of a specific circle will answer today. The question appears as part of a calm ritual — there is no pressure, no streak, no competition. People should want to answer it because it's interesting, not because an app told them to.

## The palmi voice

- Lowercase-friendly, conversational, never corporate
- Curious, not performative
- Specific beats general ("what's within arm's reach right now?" beats "what are you up to?")
- Sensory, physical, present-moment prompts work well
- Small is beautiful. Mundane is the point.
- Never therapeutic ("how are you *really* doing?"). Never dramatic ("if you could change one thing…")
- Never a choice/poll ("coffee or tea?"). Always open-ended.

## Hard rules

- Under 100 characters
- Must end with a question mark OR be a gentle imperative ("show us the last thing you drank out of.")
- No questions about politics, religion, money, weight, or appearance
- No "favorite X" questions (too broad, lazy)
- No questions that require answers longer than 30 seconds
- Answerable by a 19-year-old and a 30-year-old in the same circle
- No references to palmi, circles, or the app itself

## Output format

Return JSON only, no preamble:
{"question": "...", "tag": "sensory|memory|playful|reflective|specific|sharing"}`;

function validateQuestion(raw: string) {
  let parsed: any;
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    parsed = JSON.parse(cleaned);
  } catch { return { ok: false, reason: 'not_valid_json' }; }
  const text = typeof parsed.question === 'string' ? parsed.question.trim() : '';
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > 100) return { ok: false, reason: 'too_long', text };
  if (!/[?.]$/.test(text)) return { ok: false, reason: 'bad_punct', text };
  const forbidden = [/\bpalmi\b/i, /\bcircle\b/i, /\bfavorite\b/i, /\bpolitic/i, /\breligio/i];
  for (const p of forbidden) if (p.test(text)) return { ok: false, reason: 'forbidden', text };
  return { ok: true, text, tag: parsed.tag };
}

async function generateOne(variant: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      temperature: 1.0,
      messages: [{
        role: 'user',
        content: `Generate today's question for a circle.

Context:
- Circle name: "${variant}"
- Age: 14 days old
- Size: 6 members
- Activity: 4 posts in the last 7 days
- Today: Tuesday, 2026-04-21

Recent questions this circle has seen (DO NOT repeat these themes):
  1. What's on your desk right now?
  2. What made you laugh yesterday?

Rules reminder:
- If activity is low (< 3 posts/week), lean toward gentle, low-pressure questions
- Vary the tag from whatever was used most recently
- Be specific, be sensory, be human

Output the JSON object now.`,
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, reason: `http_${res.status}`, detail: err };
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text ?? '';
  return validateQuestion(text);
}

const variants = ['dorm 4B', 'brunch club', 'study group', 'cousins', 'hiking folks', 'the weirdos', 'group chat', 'roommates', 'sister team', 'book club'];

let pass = 0, fail = 0;
console.log(`Generating ${variants.length} questions with claude-haiku-4-5-20251001...\n`);

for (const v of variants) {
  const r = await generateOne(v);
  if (r.ok) {
    pass++;
    console.log(`✓ [${r.tag?.padEnd(10)}] ${r.text}`);
  } else {
    fail++;
    const detail = r.text ? ` — "${r.text}"` : r.detail ? ` — ${r.detail.slice(0, 80)}` : '';
    console.log(`✗ ${r.reason}${detail}`);
  }
}

console.log(`\n${pass}/${variants.length} passed validation (${(pass/variants.length*100).toFixed(0)}% pass rate)`);
