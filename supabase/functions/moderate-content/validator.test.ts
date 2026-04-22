// deno run --allow-read validator.test.ts
// Pure validator tests — no network, no DB.

import {
  CATEGORIES,
  parseClassifierOutput,
  verdictFor,
  type ClassifierOutput,
} from "./index.ts";

let failures = 0;
let passes = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${(e as Error).message}`);
  }
}
function assertEq<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ?? ""} expected ${b}, got ${a}`);
}
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// parseClassifierOutput
// ---------------------------------------------------------------------------

test("parses clean pass output", () => {
  const out = parseClassifierOutput(
    '{"categories": [], "confidence": 0.98, "reason": ""}',
  );
  assertEq(out, { categories: [], confidence: 0.98, reason: "" });
});

test("parses flagged output with single category", () => {
  const out = parseClassifierOutput(
    '{"categories": ["nsfw"], "confidence": 0.9, "reason": "explicit content"}',
  );
  assertEq(out?.categories, ["nsfw"]);
  assertEq(out?.reason, "explicit content");
});

test("strips ```json markdown fences", () => {
  const raw = "```json\n{\"categories\": [], \"confidence\": 0.5, \"reason\": \"\"}\n```";
  const out = parseClassifierOutput(raw);
  assert(out !== null, "expected parse to succeed");
  assertEq(out!.categories, []);
});

test("strips bare ``` fences", () => {
  const raw = "```\n{\"categories\": [\"self_harm\"], \"confidence\": 0.7, \"reason\": \"x\"}\n```";
  const out = parseClassifierOutput(raw);
  assertEq(out?.categories, ["self_harm"]);
});

test("returns null on invalid JSON", () => {
  assertEq(parseClassifierOutput("not json"), null);
  assertEq(parseClassifierOutput(""), null);
  assertEq(parseClassifierOutput("{bad:"), null);
});

test("filters unknown category values", () => {
  const out = parseClassifierOutput(
    '{"categories": ["nsfw", "hatespeech", "other"], "confidence": 0.5, "reason": ""}',
  );
  assertEq(out?.categories, ["nsfw"]);
});

test("deduplicates repeated categories", () => {
  const out = parseClassifierOutput(
    '{"categories": ["nsfw", "nsfw", "csam"], "confidence": 0.5, "reason": ""}',
  );
  assertEq(out?.categories, ["nsfw", "csam"]);
});

test("clamps confidence above 1", () => {
  const out = parseClassifierOutput(
    '{"categories": [], "confidence": 5, "reason": ""}',
  );
  assertEq(out?.confidence, 1);
});

test("clamps confidence below 0", () => {
  const out = parseClassifierOutput(
    '{"categories": [], "confidence": -0.2, "reason": ""}',
  );
  assertEq(out?.confidence, 0);
});

test("defaults confidence to 0.5 when missing", () => {
  const out = parseClassifierOutput('{"categories": [], "reason": ""}');
  assertEq(out?.confidence, 0.5);
});

test("defaults reason to empty when missing", () => {
  const out = parseClassifierOutput('{"categories": [], "confidence": 0.5}');
  assertEq(out?.reason, "");
});

test("truncates over-long reason", () => {
  const long = "x".repeat(500);
  const out = parseClassifierOutput(
    `{"categories": [], "confidence": 0.5, "reason": "${long}"}`,
  );
  assert((out?.reason.length ?? 0) <= 240, "reason should be truncated to 240");
});

test("rejects non-object JSON", () => {
  assertEq(parseClassifierOutput('["categories"]'), null);
  assertEq(parseClassifierOutput('"string"'), null);
  assertEq(parseClassifierOutput("null"), null);
});

test("handles non-array categories field", () => {
  const out = parseClassifierOutput(
    '{"categories": "nsfw", "confidence": 0.5, "reason": ""}',
  );
  assertEq(out?.categories, []);
});

test("knows all six spec categories exactly", () => {
  assertEq([...CATEGORIES].sort(), [
    "csam",
    "illegal_content",
    "nsfw",
    "real_names_of_non_members",
    "self_harm",
    "targeted_harassment",
  ]);
});

// ---------------------------------------------------------------------------
// verdictFor
// ---------------------------------------------------------------------------

function out(cats: any[], conf = 0.8): ClassifierOutput {
  return { categories: cats as any, confidence: conf, reason: "" };
}

test("verdict pass when no categories", () => {
  assertEq(verdictFor(out([])), "pass");
});

test("verdict hold when nsfw flagged", () => {
  assertEq(verdictFor(out(["nsfw"])), "hold");
});

test("verdict hold when self_harm flagged", () => {
  assertEq(verdictFor(out(["self_harm"])), "hold");
});

test("verdict hold when targeted_harassment flagged", () => {
  assertEq(verdictFor(out(["targeted_harassment"])), "hold");
});

test("verdict hold when real_names_of_non_members flagged", () => {
  assertEq(verdictFor(out(["real_names_of_non_members"])), "hold");
});

test("verdict hold when illegal_content flagged", () => {
  assertEq(verdictFor(out(["illegal_content"])), "hold");
});

test("csam always rejects, even alone", () => {
  assertEq(verdictFor(out(["csam"])), "reject");
});

test("csam rejects even mixed with others", () => {
  assertEq(verdictFor(out(["nsfw", "csam"])), "reject");
  assertEq(verdictFor(out(["csam", "self_harm", "illegal_content"])), "reject");
});

test("multiple non-csam flags still hold", () => {
  assertEq(verdictFor(out(["nsfw", "self_harm"])), "hold");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) Deno.exit(1);
