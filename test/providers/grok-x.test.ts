import test from "node:test";
import assert from "node:assert/strict";

import { run as runX } from "../../src/providers/grok-x.js";
import { mockFetch } from "../helpers/mock-fetch.js";
import { loadFixture } from "../helpers/fixtures.js";
import { useTmpConfigDir } from "../helpers/tmp-config.js";

const PRIOR_KEY = process.env.XAI_API_KEY;
let TMP: { restore: () => void };

test.beforeEach(() => {
  TMP = useTmpConfigDir();
});

test.afterEach(() => {
  if (PRIOR_KEY === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = PRIOR_KEY;
  TMP.restore();
});

test("grok-x: sends correct request body to xAI /responses", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  await runX({ query: "what's happening on X", route: "x" });

  m.restore();
  assert.equal(m.calls.length, 1);
  const call = m.calls[0]!;
  assert.equal(call.url, "https://api.x.ai/v1/responses");
  assert.equal(call.init.method, "POST");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer test-key");
  assert.equal(headers["content-type"], "application/json");

  const body = call.body as Record<string, unknown>;
  assert.equal(body.model, "grok-4.3");
  assert.deepEqual(body.tools, [{ type: "x_search" }]);
  assert.equal(body.tool_choice, "required", "tool_choice must be the string 'required'; xAI rejects {type:...} for built-in tools");
  assert.equal(body.parallel_tool_calls, false);
  assert.equal(body.store, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.max_output_tokens, 1024);
});

test("grok-x: parses message-annotation citations into results (regression: was empty)", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  const env = await runX({ query: "what's happening", route: "x" });

  m.restore();
  const urls = env.results.map((r) => r.url).sort();
  assert.ok(urls.includes("https://x.com/i/status/100"), "tool_result URL must be in results");
  assert.ok(urls.includes("https://x.com/i/status/102"), "annotation-only URL must be in results (was lost before fix)");
  assert.equal(env.results.length, 3, "all three unique URLs should be present, no duplicates");
  for (const r of env.results) assert.equal(r.source, "x");
});

test("grok-x: tool_result block wins over annotation for title/snippet (richer data)", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  const env = await runX({ query: "q", route: "x" });

  m.restore();
  const rich = env.results.find((r) => r.url === "https://x.com/i/status/100");
  assert.ok(rich, "URL from tool_result must be present");
  assert.equal(rich!.title, "Anthropic just shipped Claude 4.7");
  assert.match(rich!.snippet, /fast-mode/);
  assert.equal(rich!.date, "2026-05-22");
});

test("grok-x: citations and synthesis text are populated", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  const env = await runX({ query: "q", route: "x" });

  m.restore();
  assert.equal(env.citations.length, 3);
  assert.equal(env.citations[0]!.idx, 0);
  assert.match(env.answer, /Claude 4\.7/);
});

test("grok-x: cost_usd is computed from usage with cached-token discount", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  const env = await runX({ query: "q", route: "x" });

  m.restore();
  assert.ok(env.usage.cost_usd > 0, "non-zero cost for a known model");
  assert.equal(env.usage.in, 320);
  assert.equal(env.usage.out, 110);
  assert.equal(env.usage.cached, 256);
});

test("grok-x: missing XAI_API_KEY exits 3 (missing_api_key)", async () => {
  delete process.env.XAI_API_KEY;
  await assert.rejects(
    runX({ query: "q", route: "x" }),
    (err: Error & { code?: string; exit?: number }) => {
      assert.equal(err.code, "missing_api_key");
      assert.equal(err.exit, 3);
      return true;
    },
  );
});

test("grok-x: HTTP 422 surfaces as provider_error with status+body in detail", async () => {
  process.env.XAI_API_KEY = "test-key";
  const errBody = loadFixture("grok-422.json");
  const m = mockFetch({ kind: "json", status: 422, body: errBody });

  await assert.rejects(
    runX({ query: "q", route: "x" }),
    (err: Error & { code?: string; exit?: number; detail?: { status?: number; body?: unknown } }) => {
      assert.equal(err.code, "provider_error");
      assert.equal(err.exit, 4);
      assert.equal(err.detail?.status, 422);
      assert.deepEqual(err.detail?.body, errBody);
      return true;
    },
  );
  m.restore();
});

test("grok-x: network error surfaces as provider_error", async () => {
  process.env.XAI_API_KEY = "test-key";
  const m = mockFetch({ kind: "throw", error: new Error("ENOTFOUND api.x.ai") });

  await assert.rejects(
    runX({ query: "q", route: "x" }),
    (err: Error & { code?: string; exit?: number }) => {
      assert.equal(err.code, "provider_error");
      assert.equal(err.exit, 4);
      assert.match(err.message, /ENOTFOUND/);
      return true;
    },
  );
  m.restore();
});

test("grok-x: timeout aborts and surfaces as provider_error", async () => {
  process.env.XAI_API_KEY = "test-key";
  const m = mockFetch({ kind: "hang" });

  await assert.rejects(
    runX({ query: "q", route: "x", timeoutMs: 30 }),
    (err: Error & { code?: string; exit?: number }) => {
      assert.equal(err.code, "provider_error");
      assert.equal(err.exit, 4);
      return true;
    },
  );
  m.restore();
});

test("grok-x: media=true adds image+video understanding flags to tool definition", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  await runX({ query: "q", route: "x", media: true });

  m.restore();
  const tools = (m.calls[0]!.body as Record<string, unknown>).tools as Array<Record<string, unknown>>;
  assert.equal(tools[0]!.type, "x_search");
  assert.equal(tools[0]!.enable_image_understanding, true);
  assert.equal(tools[0]!.enable_video_understanding, true);
});
