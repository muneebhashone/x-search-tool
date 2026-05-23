import test from "node:test";
import assert from "node:assert/strict";

import { run as runSearch } from "../../src/providers/grok-search.js";
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

test("grok-search: sends BOTH x_search and web_search tools with tool_choice='required'", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  await runSearch({ query: "what's happening on X" });

  m.restore();
  assert.equal(m.calls.length, 1);
  const call = m.calls[0]!;
  assert.equal(call.url, "https://api.x.ai/v1/responses");
  assert.equal(call.init.method, "POST");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer test-key");

  const body = call.body as Record<string, unknown>;
  assert.equal(body.model, "grok-4.3");
  assert.deepEqual(body.tools, [{ type: "x_search" }, { type: "web_search" }]);
  assert.equal(body.tool_choice, "required", "tool_choice must be the string 'required'; xAI rejects {type:...} for built-in tools");
  assert.equal(body.parallel_tool_calls, false);
  assert.equal(body.store, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.max_output_tokens, 1024);
});

test("grok-search: x-only response tags every result source='x'", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  const env = await runSearch({ query: "what's happening" });

  m.restore();
  const urls = env.results.map((r) => r.url).sort();
  assert.ok(urls.includes("https://x.com/i/status/100"), "tool_result URL must be in results");
  assert.ok(urls.includes("https://x.com/i/status/102"), "annotation-only URL must be in results");
  assert.equal(env.results.length, 3, "all three unique URLs should be present, no duplicates");
  for (const r of env.results) assert.equal(r.source, "x");
});

test("grok-search: mixed x_search + web_search results tagged per source", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-mixed-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  const env = await runSearch({ query: "B200 benchmarks" });

  m.restore();
  const xResult = env.results.find((r) => r.url === "https://x.com/i/status/200");
  const webResult = env.results.find((r) => r.url === "https://docs.nvidia.com/b200");
  assert.ok(xResult, "x_search result present");
  assert.ok(webResult, "web_search result present");
  assert.equal(xResult!.source, "x", "x.com result tagged x");
  assert.equal(webResult!.source, "web", "nvidia docs result tagged web");
  assert.equal(env.usage.searches, 2, "both tool calls counted");
});

test("grok-search: tool_result block wins over annotation for title/snippet (richer data)", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  const env = await runSearch({ query: "q" });

  m.restore();
  const rich = env.results.find((r) => r.url === "https://x.com/i/status/100");
  assert.ok(rich, "URL from tool_result must be present");
  assert.equal(rich!.title, "Anthropic just shipped Claude 4.7");
  assert.match(rich!.snippet, /fast-mode/);
  assert.equal(rich!.date, "2026-05-22");
});

test("grok-search: citations and synthesis text are populated", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  const env = await runSearch({ query: "q" });

  m.restore();
  assert.equal(env.citations.length, 3);
  assert.equal(env.citations[0]!.idx, 0);
  assert.match(env.answer, /Claude 4\.7/);
});

test("grok-search: cost_usd is computed from usage with cached-token discount", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  const env = await runSearch({ query: "q" });

  m.restore();
  assert.ok(env.usage.cost_usd > 0, "non-zero cost for a known model");
  assert.equal(env.usage.in, 320);
  assert.equal(env.usage.out, 110);
  assert.equal(env.usage.cached, 256);
});

test("grok-search: missing XAI_API_KEY exits 3 (missing_api_key)", async () => {
  delete process.env.XAI_API_KEY;
  await assert.rejects(
    runSearch({ query: "q" }),
    (err: Error & { code?: string; exit?: number }) => {
      assert.equal(err.code, "missing_api_key");
      assert.equal(err.exit, 3);
      return true;
    },
  );
});

test("grok-search: HTTP 422 surfaces as provider_error with status+body in detail", async () => {
  process.env.XAI_API_KEY = "test-key";
  const errBody = loadFixture("grok-422.json");
  const m = mockFetch({ kind: "json", status: 422, body: errBody });

  await assert.rejects(
    runSearch({ query: "q" }),
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

test("grok-search: network error surfaces as provider_error", async () => {
  process.env.XAI_API_KEY = "test-key";
  const m = mockFetch({ kind: "throw", error: new Error("ENOTFOUND api.x.ai") });

  await assert.rejects(
    runSearch({ query: "q" }),
    (err: Error & { code?: string; exit?: number }) => {
      assert.equal(err.code, "provider_error");
      assert.equal(err.exit, 4);
      assert.match(err.message, /ENOTFOUND/);
      return true;
    },
  );
  m.restore();
});

test("grok-search: timeout aborts and surfaces as provider_error", async () => {
  process.env.XAI_API_KEY = "test-key";
  const m = mockFetch({ kind: "hang" });

  await assert.rejects(
    runSearch({ query: "q", timeoutMs: 30 }),
    (err: Error & { code?: string; exit?: number }) => {
      assert.equal(err.code, "provider_error");
      assert.equal(err.exit, 4);
      return true;
    },
  );
  m.restore();
});

test("grok-search: media=true adds image to both tools, video only to x_search", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-x-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  await runSearch({ query: "q", media: true });

  m.restore();
  const tools = (m.calls[0]!.body as Record<string, unknown>).tools as Array<Record<string, unknown>>;
  const xTool = tools.find((t) => t.type === "x_search")!;
  const webTool = tools.find((t) => t.type === "web_search")!;
  assert.equal(xTool.enable_image_understanding, true);
  assert.equal(xTool.enable_video_understanding, true);
  assert.equal(webTool.enable_image_understanding, true);
  assert.equal(webTool.enable_video_understanding, undefined, "video understanding is x_search-only per xAI docs");
});
