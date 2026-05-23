---
name: llms-search
description: Use when the task needs sources from X/Twitter, Google's search index, or fresh general web — i.e. anything the model couldn't know from training. Triggers on "on X", "on Twitter", "site:", "what's trending", "latest reactions to", "who acquired X", "recent posts about", "find sources for", "is there news on", or any query where stale training data would mislead and the user needs cited evidence.
---

# llms-search

A CLI (`llms`) that forces an LLM to call its own native search tool — Grok's `x_search` for X/Twitter, Gemini's `google_search` for Google, Grok's `web_search` for general web — and returns cited JSON. Use it instead of generic web search when value comes from the *specific* index (X data, Google grounding) or from an LLM-synthesized answer with citations rather than raw URLs.

## Install

```bash
npm i -g llm-optimized-search   # provides `llms`
# or, for one-off use without install:
npx llm-optimized-search search "<query>" --route google
```

## Routes — pick one per call

| Route | Index hit | Pick when |
|-------|-----------|-----------|
| `x` | X / Twitter | Posts, threads, real-time reactions, user opinions, viral moments, anything that *lives* on X |
| `google` | Google Search | Fresh news, `site:` queries, specific docs (vendor sites, GitHub READMEs), anywhere Google's ranking matters |
| `web` | xAI's web index | Fallback when `google` returns nothing useful; otherwise prefer `google` |

If unsure between `google` and `web`, pick `google` first.

## Call

```bash
llms search "<query>" --route x|google|web
```

No other flags exist for agents. Everything (model selection, token caps, timeout, caching, parallelism) is baked in at the cost/cache/efficiency-optimal default — do not look for knobs, there aren't any.

Pass `--pretty` only when output is going to a human. Default JSON is the stable contract; `--pretty` is not.

## Output (compact JSON, one line on stdout)

```json
{
  "query": "...",
  "route": "x",
  "results": [
    {"url": "...", "title": "...", "snippet": "...", "date": "2026-05-22", "source": "x"}
  ],
  "answer": "<1–3 sentence synthesis grounded in results>",
  "citations": [{"url": "...", "quote": "..."}],
  "cost_usd": 0.0021
}
```

| Field | Meaning |
|-------|---------|
| `results[]` | Raw hits in the order the model encountered them |
| `answer` | Short synthesis. Will be exactly `"No results."` if the search came up empty |
| `citations[]` | URLs (+ short quote) that the `answer` drew from |
| `cost_usd` | Actual call cost. Estimate computed locally from a pricing table — treat as approximate if providers change prices |

## Required env

| Route | Env var |
|-------|---------|
| `x`, `web` | `XAI_API_KEY` |
| `google` | `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) |

Pass directly; do *not* rely on a `.env` file unless you explicitly set `LLMS_DOTENV=1` first.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | OK |
| 2 | Bad args (missing/empty query, missing or invalid `--route`) |
| 3 | Missing API key |
| 4 | Provider error (network, HTTP error, rate limit) |

On non-zero exit, stdout contains `{"error":{"code":"...","message":"...","route":"...","provider":"..."}}`.

## Gotchas

- **Always pays for one LLM round-trip.** Even when you only want URLs, the model is forced to call its search tool and emit a synthesis. There's no "URLs-only" mode. Don't use `llms` if you just need a generic web lookup and an LLM in the loop is overkill.
- **Don't double-shell-quote.** If your query contains double quotes, wrap it in single quotes: `llms search 'site:example.com "claude opus"' --route google` — not nested doubles.
- **`route=x` returns x.com URLs.** Results from the X route are typically `x.com/<user>/status/<id>`. External links *inside* posts are not separately enumerated — they appear inline in `snippet`.
- **`route=google` returns vertexaisearch redirector URLs sometimes.** Gemini's grounding API surfaces redirect URLs (e.g. `https://vertexaisearch.cloud.google.com/grounding-api-redirect/...`). Treat them as canonical; follow them only if you need to scrape the destination.
- **`answer === "No results."` is a real terminal state.** Don't retry the same query; rephrase or switch route.
- **`--pretty` output is not machine-stable.** Never invoke with `--pretty` from another agent or pipeline — parse the default JSON.
- **No `--full`, `--cost`, `--timeout`, `--model`, `--max-tokens`, etc. exist.** Don't pass them; cac will reject the invocation. The defaults are deliberate.
- **One call = one search.** Parallel tool calls are disabled. If you need many searches, run `llms` many times (each invocation is independent and cached server-side after the first).

## When NOT to use

- Query is answerable from training data (definitions, math, well-known general knowledge older than ~6 months).
- You need a non-search action (file edits, code generation, shell ops, calculations).
- You need raw URLs and no LLM synthesis — `llms` always burns an LLM round-trip.
- The user wants Reddit / HN / Stack Overflow specifically — none of these are uniquely indexed here. Use a dedicated skill (`reddit-search`, `hn-search`) if available, else `--route google` with a `site:` prefix.

## Examples

```bash
# What people on X are saying about a release
llms search "reactions to Claude 4.7 release on X" --route x

# Time-bounded news from Google's index
llms search "Anysphere acquisition news May 2026" --route google

# Targeted vendor docs
llms search "site:docs.nvidia.com B200 release notes" --route google

# Real-time replies in a Twitter thread
llms search "replies to elonmusk latest tweet about Grok" --route x
```

## Recipe: parse the JSON

```bash
result=$(llms search "site:nvidia.com B200" --route google)

echo "$result" | jq -r '.answer'                  # the synthesis
echo "$result" | jq -r '.results[].url'           # all source URLs
echo "$result" | jq -r '.citations[].url'         # only URLs the answer cited
echo "$result" | jq -r '.cost_usd'                # log to your budget tracker
```

If `$?` is non-zero, the JSON is an error envelope — parse `.error.code` to branch (`bad_args` → fix call, `missing_api_key` → set env var, `provider_error` → retry / switch route).

## Picking a route — quick decision

```
query mentions X / Twitter / a handle / a thread?    → x
query has `site:` or names a specific domain?         → google
query is about news / recency / general web?          → google (fallback: web)
query is satisfied by training data?                  → don't use llms at all
```
