import test from "node:test";
import assert from "node:assert/strict";

import { resolveModel, DEFAULT_MODEL, XAI_BASE_URL } from "../src/config.js";

test("DEFAULT_MODEL: defaults to grok-4.3 (cheapest tool-capable)", () => {
  assert.equal(DEFAULT_MODEL, "grok-4.3");
});

test("resolveModel: returns DEFAULT_MODEL when no override", () => {
  assert.equal(resolveModel(), "grok-4.3");
});

test("resolveModel: override wins when non-empty", () => {
  assert.equal(resolveModel("grok-4-1-fast"), "grok-4-1-fast");
});

test("resolveModel: empty-string override falls back to default", () => {
  assert.equal(resolveModel(""), "grok-4.3");
});

test("XAI_BASE_URL: production endpoint", () => {
  assert.equal(XAI_BASE_URL, "https://api.x.ai/v1");
});
