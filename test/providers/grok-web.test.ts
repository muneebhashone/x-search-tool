import test from "node:test";
import assert from "node:assert/strict";

import { run as runWeb } from "../../src/providers/grok-web.js";
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

test("grok-web: sends type=web_search tool with tool_choice='required'", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-web-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  await runWeb({ query: "anysphere news", route: "web" });

  m.restore();
  const body = m.calls[0]!.body as Record<string, unknown>;
  assert.deepEqual(body.tools, [{ type: "web_search" }]);
  assert.equal(body.tool_choice, "required");
});

test("grok-web: results tagged source='web'", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-web-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  const env = await runWeb({ query: "q", route: "web" });

  m.restore();
  assert.ok(env.results.length >= 2);
  for (const r of env.results) assert.equal(r.source, "web");
  const urls = env.results.map((r) => r.url);
  assert.ok(urls.includes("https://example.com/a"));
  assert.ok(urls.includes("https://example.com/b"));
});

test("grok-web: media=true does NOT set enable_video_understanding (x-only flag)", async () => {
  process.env.XAI_API_KEY = "test-key";
  const fx = loadFixture("grok-web-success.json");
  const m = mockFetch({ kind: "json", status: 200, body: fx });

  await runWeb({ query: "q", route: "web", media: true });

  m.restore();
  const tools = (m.calls[0]!.body as Record<string, unknown>).tools as Array<Record<string, unknown>>;
  assert.equal(tools[0]!.enable_image_understanding, true);
  assert.equal(tools[0]!.enable_video_understanding, undefined, "video understanding is x_search-only per xAI docs");
});

test("grok-web: empty output yields empty results + 'No results.' synthesis (when model emits it)", async () => {
  process.env.XAI_API_KEY = "test-key";
  const m = mockFetch({
    kind: "json",
    status: 200,
    body: {
      model: "grok-4.3",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "No results.", annotations: [] }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 3 },
    },
  });

  const env = await runWeb({ query: "q", route: "web" });

  m.restore();
  assert.equal(env.results.length, 0);
  assert.equal(env.citations.length, 0);
  assert.equal(env.answer, "No results.");
});
