import { resolveModel, DEFAULT_MAX_TOKENS, DEFAULT_RESULTS, DEFAULT_TIMEOUT_MS } from "../config.js";
import { SYSTEM_PROMPT_X, SYSTEM_PROMPT_NO_ANSWER_SUFFIX } from "../prompts/system.js";
import type { SearchEnvelope } from "../output/schema.js";
import { callGrok } from "./_grok.js";
import type { RunOptions } from "../config.js";

export async function run(opts: RunOptions): Promise<SearchEnvelope> {
  const model = resolveModel("x", opts.model);
  const systemPrompt =
    SYSTEM_PROMPT_X + (opts.noAnswer ? SYSTEM_PROMPT_NO_ANSWER_SUFFIX : "");

  return callGrok({
    query: opts.query,
    route: "x",
    model,
    systemPrompt,
    toolType: "x_search",
    maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    maxResults: opts.maxResults ?? DEFAULT_RESULTS,
    noAnswer: opts.noAnswer ?? false,
    media: opts.media ?? false,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    full: opts.full ?? false,
  });
}
