import test from "node:test";
import assert from "node:assert/strict";

import { computeCostUsd, XAI_PRICING } from "../../src/cost/pricing.js";

test("pricing: unknown model returns 0 (don't guess)", () => {
  const cost = computeCostUsd({
    model: "made-up-model",
    provider: "xai",
    in_tokens: 1000,
    cached_tokens: 0,
    out_tokens: 500,
    searches: 1,
  });
  assert.equal(cost, 0);
});

test("pricing: xai grok-4.3 basic math (no cache, no search fee)", () => {
  const p = XAI_PRICING["grok-4.3"]!;
  const cost = computeCostUsd({
    model: "grok-4.3",
    provider: "xai",
    in_tokens: 1_000_000,
    cached_tokens: 0,
    out_tokens: 1_000_000,
    searches: 0,
  });
  assert.equal(cost, p.input_per_mtok + p.output_per_mtok);
});

test("pricing: cached tokens get 10% rate when no explicit cached_input_per_mtok", () => {
  const p = XAI_PRICING["grok-4.3"]!;
  assert.equal(p.cached_input_per_mtok, undefined, "test premise: grok-4.3 has no explicit cached rate");
  const cost = computeCostUsd({
    model: "grok-4.3",
    provider: "xai",
    in_tokens: 1_000_000,
    cached_tokens: 1_000_000,
    out_tokens: 0,
    searches: 0,
  });
  assert.equal(cost, p.input_per_mtok * 0.1);
});

test("pricing: cached tokens never billed at full input rate", () => {
  const billable = computeCostUsd({
    model: "grok-4.3",
    provider: "xai",
    in_tokens: 1000,
    cached_tokens: 800,
    out_tokens: 0,
    searches: 0,
  });
  const uncached = computeCostUsd({
    model: "grok-4.3",
    provider: "xai",
    in_tokens: 1000,
    cached_tokens: 0,
    out_tokens: 0,
    searches: 0,
  });
  assert.ok(billable < uncached, "cached call must cost less than equivalent uncached");
});

test("pricing: xai has no per-search fee (searches don't add cost)", () => {
  const noSearch = computeCostUsd({
    model: "grok-4.3",
    provider: "xai",
    in_tokens: 1000,
    cached_tokens: 0,
    out_tokens: 500,
    searches: 0,
  });
  const twoSearches = computeCostUsd({
    model: "grok-4.3",
    provider: "xai",
    in_tokens: 1000,
    cached_tokens: 0,
    out_tokens: 500,
    searches: 2,
  });
  assert.equal(noSearch, twoSearches, "xAI pricing has no per_search_usd component");
});

test("pricing: result is rounded to 6 decimals", () => {
  const cost = computeCostUsd({
    model: "grok-4.3",
    provider: "xai",
    in_tokens: 1,
    cached_tokens: 0,
    out_tokens: 1,
    searches: 0,
  });
  assert.equal(cost, Math.round(cost * 1_000_000) / 1_000_000);
});

test("pricing: cached_tokens > in_tokens clamps to non-negative billable input", () => {
  const cost = computeCostUsd({
    model: "grok-4.3",
    provider: "xai",
    in_tokens: 100,
    cached_tokens: 1000,
    out_tokens: 0,
    searches: 0,
  });
  assert.ok(cost >= 0, "must never go negative");
});
