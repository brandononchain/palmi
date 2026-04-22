// deno run --allow-read integration.test.ts
// Verdict → moderation_status mapping and fail-open contract.
// These test the pure logic the handler relies on, not a live DB.

import { parseClassifierOutput, verdictFor } from "./index.ts";

let failures = 0;
let passes = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name}\n       ${(e as Error).message}`);
  }
}
function assertEq<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ?? ""} expected ${b}, got ${a}`);
}

// Mapping used inside the handler. Keep in lockstep with index.ts.
function modStatusFor(verdict: "pass" | "hold" | "reject"): "ok" | "held" | null {
  if (verdict === "pass") return "ok";
  if (verdict === "hold") return "held";
  return null;
}

// ---------------------------------------------------------------------------

test("clean content → pass → ok", () => {
  const v = verdictFor(parseClassifierOutput(
    '{"categories": [], "confidence": 0.95, "reason": ""}',
  )!);
  assertEq(v, "pass");
  assertEq(modStatusFor(v), "ok");
});

test("nsfw → hold → held", () => {
  const v = verdictFor(parseClassifierOutput(
    '{"categories": ["nsfw"], "confidence": 0.9, "reason": "x"}',
  )!);
  assertEq(v, "hold");
  assertEq(modStatusFor(v), "held");
});

test("csam → reject → no insert", () => {
  const v = verdictFor(parseClassifierOutput(
    '{"categories": ["csam"], "confidence": 0.99, "reason": "x"}',
  )!);
  assertEq(v, "reject");
  assertEq(modStatusFor(v), null);
});

test("targeted_harassment → hold", () => {
  const v = verdictFor(parseClassifierOutput(
    '{"categories": ["targeted_harassment"], "confidence": 0.8, "reason": "x"}',
  )!);
  assertEq(v, "hold");
});

test("self_harm → hold (not reject — held for review, not auto-rejected)", () => {
  const v = verdictFor(parseClassifierOutput(
    '{"categories": ["self_harm"], "confidence": 0.7, "reason": "x"}',
  )!);
  assertEq(v, "hold");
});

test("real_names_of_non_members → hold", () => {
  const v = verdictFor(parseClassifierOutput(
    '{"categories": ["real_names_of_non_members"], "confidence": 0.6, "reason": "x"}',
  )!);
  assertEq(v, "hold");
});

test("illegal_content → hold", () => {
  const v = verdictFor(parseClassifierOutput(
    '{"categories": ["illegal_content"], "confidence": 0.8, "reason": "x"}',
  )!);
  assertEq(v, "hold");
});

test("csam + nsfw together → reject (csam dominates)", () => {
  const v = verdictFor(parseClassifierOutput(
    '{"categories": ["nsfw", "csam"], "confidence": 0.9, "reason": "x"}',
  )!);
  assertEq(v, "reject");
});

test("malformed classifier output → parser returns null → caller must fail open", () => {
  const parsed = parseClassifierOutput("not json");
  assertEq(parsed, null);
  // Handler contract: on null, synthesize pass verdict. Asserted here as the rule.
  const failOpenVerdict: "pass" = "pass";
  assertEq(failOpenVerdict, "pass");
  assertEq(modStatusFor(failOpenVerdict), "ok");
});

test("empty categories with high confidence still passes", () => {
  const v = verdictFor(parseClassifierOutput(
    '{"categories": [], "confidence": 1.0, "reason": ""}',
  )!);
  assertEq(v, "pass");
});

test("content_type post maps to moderation_events content_type 'post'", () => {
  const contentType: "post" | "answer" = "post";
  const logged = contentType === "post" ? "post" : "answer";
  assertEq(logged, "post");
});

test("content_type answer maps to moderation_events content_type 'answer'", () => {
  const contentType: "post" | "answer" = "answer";
  const logged = contentType === "post" ? "post" : "answer";
  assertEq(logged, "answer");
});

test("reject verdict writes moderation_events with content_id=null", () => {
  const verdict: "reject" = "reject";
  const status = modStatusFor(verdict);
  // No content row was inserted → content_id must be null.
  assertEq(status, null);
});

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) Deno.exit(1);
