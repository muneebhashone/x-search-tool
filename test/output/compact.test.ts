import test from "node:test";
import assert from "node:assert/strict";

import { formatCompact, formatErrorCompact } from "../../src/output/compact.js";
import type { SearchEnvelope, ErrorEnvelope } from "../../src/output/schema.js";

const ENV: SearchEnvelope = {
  query: "q",
  model: "grok-4.3",
  results: [{ url: "https://x.com/i/status/1", title: "t", snippet: "s", source: "x" }],
  answer: "a",
  citations: [{ idx: 0, url: "https://x.com/i/status/1", quote: "qq" }],
  usage: { in: 100, out: 50, cached: 80, searches: 1, cost_usd: 0.001234 },
};

test("formatCompact: documented contract — exactly query/results/answer/citations/cost_usd", () => {
  const json = JSON.parse(formatCompact(ENV));
  assert.deepEqual(Object.keys(json).sort(), [
    "answer",
    "citations",
    "cost_usd",
    "query",
    "results",
  ]);
});

test("formatCompact: does NOT leak model/usage/raw to agent contract", () => {
  const json = JSON.parse(formatCompact(ENV));
  assert.equal(json.model, undefined);
  assert.equal(json.usage, undefined);
  assert.equal(json.raw, undefined);
});

test("formatCompact: cost_usd is hoisted from usage to top-level", () => {
  const json = JSON.parse(formatCompact(ENV));
  assert.equal(json.cost_usd, 0.001234);
});

test("formatCompact: citations preserve url + optional quote", () => {
  const json = JSON.parse(formatCompact(ENV));
  assert.deepEqual(json.citations, [{ url: "https://x.com/i/status/1", quote: "qq" }]);

  const noQuote = { ...ENV, citations: [{ idx: 0, url: "u" }] };
  const json2 = JSON.parse(formatCompact(noQuote));
  assert.deepEqual(json2.citations, [{ url: "u" }]);
});

test("formatCompact: output is single line of JSON (no pretty-printing)", () => {
  const out = formatCompact(ENV);
  assert.equal(out.includes("\n"), false);
  assert.equal(out.includes("  "), false, "no double-spaces from indentation");
});

test("formatErrorCompact: passes through the error envelope structure", () => {
  const e: ErrorEnvelope = {
    error: { code: "bad_args", message: "missing route" },
  };
  assert.equal(formatErrorCompact(e), JSON.stringify(e));
});
