import { GoogleGenAI } from "@google/genai";

import {
  resolveModel,
  DEFAULT_MAX_TOKENS,
  DEFAULT_RESULTS,
  DEFAULT_TIMEOUT_MS,
} from "../config.js";
import { computeCostUsd } from "../cost/pricing.js";
import { missingKey, providerError } from "../errors.js";
import { resolveApiKey } from "../auth/resolve.js";
import {
  SYSTEM_PROMPT_GOOGLE,
  SYSTEM_PROMPT_NO_ANSWER_SUFFIX,
} from "../prompts/system.js";
import type { RunOptions } from "../config.js";
import type { Citation, Result, SearchEnvelope } from "../output/schema.js";

export async function run(opts: RunOptions): Promise<SearchEnvelope> {
  const apiKey = resolveApiKey("gemini").key;
  if (!apiKey) throw missingKey("GEMINI_API_KEY", "google");

  const model = resolveModel("google", opts.model);
  const systemPrompt =
    SYSTEM_PROMPT_GOOGLE + (opts.noAnswer ? SYSTEM_PROMPT_NO_ANSWER_SUFFIX : "");

  const ai = new GoogleGenAI({ apiKey });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let raw: unknown;
  try {
    raw = await ai.models.generateContent({
      model,
      contents: opts.query,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} }],
        temperature: 0,
        maxOutputTokens: opts.noAnswer ? 64 : (opts.maxTokens ?? DEFAULT_MAX_TOKENS),
        abortSignal: controller.signal,
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    throw providerError((err as Error).message ?? "gemini error", {
      route: "google",
      provider: "gemini",
      detail: { name: (err as Error).name },
    });
  }
  clearTimeout(timeout);

  return parseGeminiResponse(raw as Record<string, unknown>, {
    query: opts.query,
    model,
    maxResults: opts.maxResults ?? DEFAULT_RESULTS,
    noAnswer: opts.noAnswer ?? false,
    full: opts.full ?? false,
  });
}

function parseGeminiResponse(
  raw: Record<string, unknown>,
  ctx: {
    query: string;
    model: string;
    maxResults: number;
    noAnswer: boolean;
    full: boolean;
  },
): SearchEnvelope {
  const candidates = (raw["candidates"] ?? []) as unknown[];
  const cand0 = isObject(candidates[0]) ? candidates[0] : {};
  const grounding = isObject(cand0["groundingMetadata"])
    ? cand0["groundingMetadata"]
    : {};

  const chunks = Array.isArray(grounding["groundingChunks"])
    ? (grounding["groundingChunks"] as unknown[])
    : [];
  const supports = Array.isArray(grounding["groundingSupports"])
    ? (grounding["groundingSupports"] as unknown[])
    : [];
  const queries = Array.isArray(grounding["webSearchQueries"])
    ? (grounding["webSearchQueries"] as unknown[])
    : [];

  const results: Result[] = [];
  const chunkSnippets: Record<number, string[]> = {};

  for (const sup of supports) {
    if (!isObject(sup)) continue;
    const segment = isObject(sup["segment"]) ? sup["segment"] : {};
    const segText = typeof segment["text"] === "string" ? segment["text"] : "";
    const idxs = Array.isArray(sup["groundingChunkIndices"])
      ? (sup["groundingChunkIndices"] as unknown[])
      : [];
    for (const i of idxs) {
      const n = typeof i === "number" ? i : Number(i);
      if (!Number.isFinite(n)) continue;
      const list = chunkSnippets[n] ?? (chunkSnippets[n] = []);
      if (segText && !list.includes(segText)) list.push(segText);
    }
  }

  chunks.forEach((chunk, i) => {
    if (!isObject(chunk)) return;
    const web = isObject(chunk["web"]) ? chunk["web"] : {};
    const url = String(web["uri"] ?? web["url"] ?? "");
    if (!url) return;
    if (results.some((r) => r.url === url)) return;
    const title = String(web["title"] ?? "");
    const snippets = chunkSnippets[i] ?? [];
    const snippet = snippets.join(" ").slice(0, 500);
    results.push({ url, title, snippet, source: "web" });
  });

  const citations: Citation[] = supports
    .flatMap((sup) => {
      if (!isObject(sup)) return [];
      const segment = isObject(sup["segment"]) ? sup["segment"] : {};
      const quote = typeof segment["text"] === "string" ? segment["text"] : undefined;
      const idxs = Array.isArray(sup["groundingChunkIndices"])
        ? (sup["groundingChunkIndices"] as unknown[])
        : [];
      return idxs
        .map((i) => {
          const n = typeof i === "number" ? i : Number(i);
          if (!Number.isFinite(n)) return null;
          const chunk = chunks[n];
          if (!isObject(chunk)) return null;
          const web = isObject(chunk["web"]) ? chunk["web"] : {};
          const url = String(web["uri"] ?? web["url"] ?? "");
          if (!url) return null;
          const cit: Citation = { idx: n, url };
          if (quote) cit.quote = quote.slice(0, 280);
          return cit;
        })
        .filter((x): x is Citation => x !== null);
    })
    .filter((c, i, all) => all.findIndex((x) => x.url === c.url) === i);

  const answer = ctx.noAnswer ? "" : extractText(raw, cand0).trim();

  const usageMeta = isObject(raw["usageMetadata"]) ? raw["usageMetadata"] : {};
  const in_tokens = toInt(usageMeta["promptTokenCount"]);
  const out_tokens = toInt(usageMeta["candidatesTokenCount"]);
  const cached_tokens = toInt(usageMeta["cachedContentTokenCount"]);
  const searches = queries.length || (results.length > 0 ? 1 : 0);
  const effectiveSearches = ctx.model.startsWith("gemini-3")
    ? searches
    : Math.min(1, searches);

  const cost_usd = computeCostUsd({
    model: ctx.model,
    provider: "gemini",
    in_tokens,
    cached_tokens,
    out_tokens,
    searches: effectiveSearches,
  });

  const envelope: SearchEnvelope = {
    query: ctx.query,
    route: "google",
    model: ctx.model,
    results: results.slice(0, ctx.maxResults),
    answer,
    citations,
    usage: {
      in: in_tokens,
      out: out_tokens,
      cached: cached_tokens,
      searches,
      cost_usd,
    },
  };
  if (ctx.full) envelope.raw = raw;
  return envelope;
}

function extractText(raw: Record<string, unknown>, cand: Record<string, unknown>): string {
  if (typeof raw["text"] === "string") return raw["text"] as string;
  const content = isObject(cand["content"]) ? cand["content"] : {};
  const parts = Array.isArray(content["parts"]) ? (content["parts"] as unknown[]) : [];
  return parts
    .map((p) => (isObject(p) && typeof p["text"] === "string" ? (p["text"] as string) : ""))
    .join("");
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
