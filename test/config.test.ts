import test from "node:test";
import assert from "node:assert/strict";

import { resolveModel, DEFAULT_MODEL, XAI_BASE_URL } from "../src/config.js";

test("DEFAULT_MODEL: x and web both default to grok-4.3 (cheapest tool-capable)", () => {
  assert.equal(DEFAULT_MODEL.x, "grok-4.3");
  assert.equal(DEFAULT_MODEL.web, "grok-4.3");
});

test("DEFAULT_MODEL: google defaults to gemini-2.5-flash (cheapest grounding-capable)", () => {
  assert.equal(DEFAULT_MODEL.google, "gemini-2.5-flash");
});

test("resolveModel: returns DEFAULT_MODEL when no override", () => {
  assert.equal(resolveModel("x"), "grok-4.3");
  assert.equal(resolveModel("web"), "grok-4.3");
  assert.equal(resolveModel("google"), "gemini-2.5-flash");
});

test("resolveModel: override wins when non-empty", () => {
  assert.equal(resolveModel("x", "grok-4-1-fast"), "grok-4-1-fast");
});

test("resolveModel: empty-string override falls back to default", () => {
  assert.equal(resolveModel("x", ""), "grok-4.3");
});

test("XAI_BASE_URL: production endpoint", () => {
  assert.equal(XAI_BASE_URL, "https://api.x.ai/v1");
});
