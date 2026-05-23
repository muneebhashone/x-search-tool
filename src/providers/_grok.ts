import { XAI_BASE_URL } from "../config.js";
import { computeCostUsd } from "../cost/pricing.js";
import { missingKey, providerError } from "../errors.js";
import { resolveApiKey } from "../auth/resolve.js";
import type { Citation, Result, Route, SearchEnvelope } from "../output/schema.js";

type GrokToolType = "x_search" | "web_search";

type GrokCallOpts = {
  query: string;
  route: Route;
  model: string;
  systemPrompt: string;
  toolType: GrokToolType;
  maxTokens: number;
  maxResults: number;
  noAnswer: boolean;
  media: boolean;
  timeoutMs: number;
  full: boolean;
};

export async function callGrok(opts: GrokCallOpts): Promise<SearchEnvelope> {
  const apiKey = resolveApiKey("xai").key;
  if (!apiKey) throw missingKey("XAI_API_KEY", opts.route);

  const toolDef: Record<string, unknown> = { type: opts.toolType };
  if (opts.media) {
    toolDef["enable_image_understanding"] = true;
    if (opts.toolType === "x_search") toolDef["enable_video_understanding"] = true;
  }

  const body = {
    model: opts.model,
    input: [{ role: "user", content: opts.query }],
    instructions: opts.systemPrompt,
    tools: [toolDef],
    tool_choice: "required",
    max_output_tokens: opts.noAnswer ? 64 : opts.maxTokens,
    parallel_tool_calls: false,
    store: false,
    temperature: 0,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${XAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw providerError((err as Error).message ?? "network error", {
      route: opts.route,
      provider: "xai",
      detail: { kind: "network" },
    });
  }
  clearTimeout(timeout);

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }

  if (!res.ok) {
    throw providerError(`xAI HTTP ${res.status}`, {
      route: opts.route,
      provider: "xai",
      detail: { status: res.status, body: json },
    });
  }

  return parseGrokResponse(json as Record<string, unknown>, opts);
}

function parseGrokResponse(
  raw: Record<string, unknown>,
  opts: GrokCallOpts,
): SearchEnvelope {
  const out = (raw["output"] ?? []) as unknown[];
  const usage = (raw["usage"] ?? {}) as Record<string, unknown>;

  const results: Result[] = [];
  const citations: Citation[] = [];
  const synthesisParts: string[] = [];
  let searches = 0;

  for (const block of out) {
    if (!isObject(block)) continue;
    const type = String(block["type"] ?? "");

    if (type === `${opts.toolType}_call` || type === "server_tool_use") {
      searches += 1;
      collectResultsFromBlock(block, results, opts.toolType);
    } else if (
      type === `${opts.toolType}_result` ||
      type === "server_tool_result" ||
      type === "tool_result"
    ) {
      collectResultsFromBlock(block, results, opts.toolType);
    } else if (type === "message" || type === "output_text") {
      collectTextFromMessage(block, synthesisParts, citations, results, opts.toolType);
    }
  }

  const topCitations = (raw["citations"] ?? []) as unknown[];
  for (const c of topCitations) {
    if (!isObject(c)) continue;
    const url = String(c["url"] ?? "");
    if (!url) continue;
    citations.push({ idx: citations.length, url });
    if (!results.some((r) => r.url === url)) {
      results.push({
        url,
        title: String(c["title"] ?? ""),
        snippet: String(c["snippet"] ?? c["text"] ?? ""),
        source: opts.toolType === "x_search" ? "x" : "web",
      });
    }
  }

  if (searches === 0) {
    const ssu = (raw["server_side_tool_use"] ?? {}) as Record<string, unknown>;
    const candidate = Object.values(ssu).find((v) => typeof v === "number");
    if (typeof candidate === "number") searches = candidate;
    else if (results.length > 0) searches = 1;
  }

  const trimmedResults = results.slice(0, opts.maxResults);
  const in_tokens = toInt(usage["input_tokens"] ?? usage["prompt_tokens"]);
  const out_tokens = toInt(usage["output_tokens"] ?? usage["completion_tokens"]);
  const cached_tokens = toInt(
    usage["cached_tokens"] ??
      (usage["prompt_tokens_details"] as Record<string, unknown> | undefined)?.["cached_tokens"],
  );

  const cost_usd = computeCostUsd({
    model: opts.model,
    provider: "xai",
    in_tokens,
    cached_tokens,
    out_tokens,
    searches,
  });

  const envelope: SearchEnvelope = {
    query: opts.query,
    route: opts.route,
    model: opts.model,
    results: trimmedResults,
    answer: opts.noAnswer ? "" : synthesisParts.join("").trim(),
    citations,
    usage: {
      in: in_tokens,
      out: out_tokens,
      cached: cached_tokens,
      searches,
      cost_usd,
    },
  };
  if (opts.full) envelope.raw = raw;
  return envelope;
}

function collectResultsFromBlock(
  block: Record<string, unknown>,
  results: Result[],
  toolType: GrokToolType,
): void {
  const sourceTag: "x" | "web" = toolType === "x_search" ? "x" : "web";
  const candidates: unknown[] = [];

  const direct = block["results"];
  if (Array.isArray(direct)) candidates.push(...direct);

  const content = block["content"];
  if (Array.isArray(content)) {
    for (const c of content) {
      if (isObject(c)) {
        const sub = c["results"];
        if (Array.isArray(sub)) candidates.push(...sub);
        if (
          typeof c["url"] === "string" ||
          typeof c["title"] === "string" ||
          c["type"] === "search_result" ||
          c["type"] === "web_search_result" ||
          c["type"] === "x_search_result"
        ) {
          candidates.push(c);
        }
      }
    }
  }

  const cites = block["citations"];
  if (Array.isArray(cites)) candidates.push(...cites);

  for (const cand of candidates) {
    if (!isObject(cand)) continue;
    const url = String(cand["url"] ?? cand["uri"] ?? cand["link"] ?? "");
    if (!url) continue;
    if (results.some((r) => r.url === url)) continue;
    const r: Result = {
      url,
      title: String(cand["title"] ?? cand["name"] ?? cand["text"] ?? ""),
      snippet: String(
        cand["snippet"] ?? cand["text"] ?? cand["description"] ?? cand["content"] ?? "",
      ).slice(0, 500),
      source: sourceTag,
    };
    const date = cand["date"] ?? cand["published_at"] ?? cand["page_age"] ?? cand["created_at"];
    if (typeof date === "string" && date.length > 0) r.date = date;
    results.push(r);
  }
}

function collectTextFromMessage(
  block: Record<string, unknown>,
  texts: string[],
  citations: Citation[],
  results: Result[],
  toolType: GrokToolType,
): void {
  const sourceTag: "x" | "web" = toolType === "x_search" ? "x" : "web";
  const content = block["content"];
  if (typeof block["text"] === "string") texts.push(block["text"] as string);
  if (Array.isArray(content)) {
    for (const c of content) {
      if (!isObject(c)) continue;
      if (typeof c["text"] === "string") texts.push(c["text"] as string);
      const annotations = c["annotations"];
      if (Array.isArray(annotations)) {
        for (const a of annotations) {
          if (!isObject(a)) continue;
          const url = String(a["url"] ?? "");
          if (!url) continue;
          const quote = a["quote"] ?? a["text"];
          if (!citations.some((x) => x.url === url)) {
            const cit: Citation = { idx: citations.length, url };
            if (typeof quote === "string") cit.quote = quote.slice(0, 280);
            citations.push(cit);
          }
          if (!results.some((r) => r.url === url)) {
            const r: Result = {
              url,
              title: String(a["title"] ?? ""),
              snippet: typeof quote === "string" ? quote.slice(0, 500) : "",
              source: sourceTag,
            };
            const date = a["date"] ?? a["published_at"] ?? a["created_at"];
            if (typeof date === "string" && date.length > 0) r.date = date;
            results.push(r);
          }
        }
      }
    }
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}
