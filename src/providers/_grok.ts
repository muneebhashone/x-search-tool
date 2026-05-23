import { XAI_BASE_URL } from "../config.js";
import { computeCostUsd } from "../cost/pricing.js";
import { missingKey, providerError } from "../errors.js";
import { resolveApiKey } from "../auth/resolve.js";
import type { Citation, Result, SearchEnvelope } from "../output/schema.js";

export type GrokToolType = "x_search" | "web_search";

type GrokCallOpts = {
  query: string;
  model: string;
  systemPrompt: string;
  toolTypes: GrokToolType[];
  maxTokens: number;
  maxResults: number;
  noAnswer: boolean;
  media: boolean;
  timeoutMs: number;
  full: boolean;
};

const CALL_TYPES = new Set(["x_search_call", "web_search_call", "server_tool_use"]);
const RESULT_TYPES = new Set([
  "x_search_result",
  "web_search_result",
  "server_tool_result",
  "tool_result",
]);

export async function callGrok(opts: GrokCallOpts): Promise<SearchEnvelope> {
  const apiKey = resolveApiKey("xai").key;
  if (!apiKey) throw missingKey("XAI_API_KEY");

  const tools = opts.toolTypes.map((type) => {
    const toolDef: Record<string, unknown> = { type };
    if (opts.media) {
      toolDef["enable_image_understanding"] = true;
      if (type === "x_search") toolDef["enable_video_understanding"] = true;
    }
    return toolDef;
  });

  const body = {
    model: opts.model,
    input: [{ role: "user", content: opts.query }],
    instructions: opts.systemPrompt,
    tools,
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

    if (CALL_TYPES.has(type)) {
      searches += 1;
      collectResultsFromBlock(block, results, type);
    } else if (RESULT_TYPES.has(type)) {
      collectResultsFromBlock(block, results, type);
    } else if (type === "message" || type === "output_text") {
      collectTextFromMessage(block, synthesisParts, citations, results);
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
        source: sourceFromUrl(url),
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
  blockType: string,
): void {
  const candidates: Record<string, unknown>[] = [];

  const direct = block["results"];
  if (Array.isArray(direct)) for (const d of direct) if (isObject(d)) candidates.push(d);

  const content = block["content"];
  if (Array.isArray(content)) {
    for (const c of content) {
      if (isObject(c)) {
        const sub = c["results"];
        if (Array.isArray(sub)) for (const s of sub) if (isObject(s)) candidates.push(s);
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
  if (Array.isArray(cites)) for (const c of cites) if (isObject(c)) candidates.push(c);

  for (const cand of candidates) {
    const url = String(cand["url"] ?? cand["uri"] ?? cand["link"] ?? "");
    if (!url) continue;
    if (results.some((r) => r.url === url)) continue;
    const r: Result = {
      url,
      title: String(cand["title"] ?? cand["name"] ?? cand["text"] ?? ""),
      snippet: String(
        cand["snippet"] ?? cand["text"] ?? cand["description"] ?? cand["content"] ?? "",
      ).slice(0, 500),
      source: resolveSource(asStr(cand["type"]), blockType, url),
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
): void {
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
              source: sourceFromUrl(url),
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

function sourceFromType(type: string | undefined): "x" | "web" | null {
  if (!type) return null;
  if (type.startsWith("x_search")) return "x";
  if (type.startsWith("web_search")) return "web";
  return null;
}

function sourceFromUrl(url: string): "x" | "web" {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "web";
  }
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host.endsWith(".x.com") || host.endsWith(".twitter.com")) return "x";
  return "web";
}

function resolveSource(
  itemType: string | undefined,
  blockType: string | undefined,
  url: string,
): "x" | "web" {
  return sourceFromType(itemType) ?? sourceFromType(blockType) ?? sourceFromUrl(url);
}

function asStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
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
