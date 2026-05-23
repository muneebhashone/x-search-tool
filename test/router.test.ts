import test from "node:test";
import assert from "node:assert/strict";

import { route as runRoute, KNOWN_ROUTES } from "../src/router.js";
import { mockFetch } from "./helpers/mock-fetch.js";
import { loadFixture } from "./helpers/fixtures.js";
import { useTmpConfigDir } from "./helpers/tmp-config.js";

const PRIOR_X = process.env.XAI_API_KEY;
const PRIOR_G = process.env.GEMINI_API_KEY;
let TMP: { restore: () => void };

test.beforeEach(() => {
  TMP = useTmpConfigDir();
});

test.afterEach(() => {
  if (PRIOR_X === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = PRIOR_X;
  if (PRIOR_G === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = PRIOR_G;
  TMP.restore();
});

test("router: KNOWN_ROUTES covers x|google|web", () => {
  assert.deepEqual([...KNOWN_ROUTES].sort(), ["google", "web", "x"]);
});

test("router: route='x' dispatches to grok-x (xAI endpoint, x_search tool)", async () => {
  process.env.XAI_API_KEY = "test-key";
  const m = mockFetch({ kind: "json", status: 200, body: loadFixture("grok-x-success.json") });

  const env = await runRoute({ query: "q", route: "x" });

  m.restore();
  assert.equal(env.route, "x");
  assert.equal(m.calls[0]!.url, "https://api.x.ai/v1/responses");
  const tools = (m.calls[0]!.body as Record<string, unknown>).tools as Array<Record<string, unknown>>;
  assert.equal(tools[0]!.type, "x_search");
});

test("router: route='web' dispatches to grok-web (xAI endpoint, web_search tool)", async () => {
  process.env.XAI_API_KEY = "test-key";
  const m = mockFetch({ kind: "json", status: 200, body: loadFixture("grok-web-success.json") });

  const env = await runRoute({ query: "q", route: "web" });

  m.restore();
  assert.equal(env.route, "web");
  assert.equal(m.calls[0]!.url, "https://api.x.ai/v1/responses");
  const tools = (m.calls[0]!.body as Record<string, unknown>).tools as Array<Record<string, unknown>>;
  assert.equal(tools[0]!.type, "web_search");
});
