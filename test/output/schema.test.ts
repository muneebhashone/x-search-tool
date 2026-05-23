import test from "node:test";
import assert from "node:assert/strict";

import {
  RouteSchema,
  ResultSchema,
  CitationSchema,
  UsageSchema,
  SearchEnvelopeSchema,
  ErrorEnvelopeSchema,
} from "../../src/output/schema.js";

test("RouteSchema accepts x|google|web only", () => {
  for (const r of ["x", "google", "web"] as const) {
    assert.equal(RouteSchema.parse(r), r);
  }
  assert.equal(RouteSchema.safeParse("twitter").success, false);
  assert.equal(RouteSchema.safeParse("").success, false);
});

test("ResultSchema requires url/title/snippet/source; date optional", () => {
  assert.equal(
    ResultSchema.safeParse({
      url: "https://x.com/i/status/1",
      title: "",
      snippet: "",
      source: "x",
    }).success,
    true,
  );
  assert.equal(
    ResultSchema.safeParse({
      url: "u",
      title: "t",
      snippet: "s",
      source: "google",
    }).success,
    false,
    "source must be 'x' or 'web' — google route still tags results, but the per-result tag is x/web",
  );
});

test("CitationSchema: idx must be non-negative int", () => {
  assert.equal(CitationSchema.safeParse({ idx: 0, url: "u" }).success, true);
  assert.equal(CitationSchema.safeParse({ idx: -1, url: "u" }).success, false);
  assert.equal(CitationSchema.safeParse({ idx: 1.5, url: "u" }).success, false);
});

test("UsageSchema: cost_usd must be non-negative number", () => {
  assert.equal(
    UsageSchema.safeParse({ in: 0, out: 0, cached: 0, searches: 0, cost_usd: 0 }).success,
    true,
  );
  assert.equal(
    UsageSchema.safeParse({ in: 0, out: 0, cached: 0, searches: 0, cost_usd: -1 }).success,
    false,
  );
});

test("SearchEnvelopeSchema validates a realistic envelope", () => {
  const env = {
    query: "q",
    route: "x" as const,
    model: "grok-4.3",
    results: [{ url: "u", title: "t", snippet: "s", source: "x" as const }],
    answer: "a",
    citations: [{ idx: 0, url: "u" }],
    usage: { in: 100, out: 50, cached: 80, searches: 1, cost_usd: 0.0012 },
  };
  const parsed = SearchEnvelopeSchema.safeParse(env);
  assert.equal(parsed.success, true, JSON.stringify(parsed));
});

test("ErrorEnvelopeSchema validates structure", () => {
  assert.equal(
    ErrorEnvelopeSchema.safeParse({
      error: { code: "bad_args", message: "missing route" },
    }).success,
    true,
  );
  assert.equal(
    ErrorEnvelopeSchema.safeParse({
      error: { code: "provider_error", message: "x", route: "x", provider: "xai", detail: { status: 422 } },
    }).success,
    true,
  );
  assert.equal(
    ErrorEnvelopeSchema.safeParse({ error: { message: "x" } }).success,
    false,
    "code required",
  );
});
