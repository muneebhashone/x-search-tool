---
name: x-search
description: Use when the task needs sources from X/Twitter — real-time posts, threads, reactions, what people are saying right now — and fresh general-web context only as a fallback. Triggers on "on X", "on Twitter", "what's trending", "latest reactions to", "replies to", "who said", "recent posts about", or any query where X is the primary index and stale training data would mislead. Returns cited JSON.
---

# x-search

A CLI (`x-search`) that forces Grok to run an X-first search and return cited JSON. One call hands the model **two** tools — `x_search` (X/Twitter, primary) and `web_search` (general web, fallback) — and the model is instructed to prefer X and only reach for the web when X is insufficient. Use it when value comes from the X index or from an LLM-synthesized answer with citations rather than raw URLs.

## Install

Not on npm. The `x-search` binary must already be on `PATH` — if it isn't, ask the user to follow the project README (clone + `npm install && npm run build && npm link`).

## Call

```bash
x-search search "<query>"
```

No route flag, no other flags for agents. The single search is always X-first with web fallback. Everything (model selection, token caps, timeout, caching, parallelism) is baked in at the cost/cache/efficiency-optimal default — do not look for knobs, there aren't any.

Pass `--pretty` only when output is going to a human. Default JSON is the stable contract; `--pretty` is not.

## Output (compact JSON, one line on stdout)

```json
{
  "query": "...",
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
| `results[]` | Raw hits in the order the model encountered them. Each carries `source: "x"` (from X/Twitter) or `source: "web"` (from the web-search fallback) |
| `answer` | Short synthesis. Will be exactly `"No results."` if the search came up empty |
| `citations[]` | URLs (+ short quote) that the `answer` drew from |
| `cost_usd` | Actual call cost. Estimate computed locally from a pricing table — treat as approximate if providers change prices |

## Required env

| Var | Used for |
|-----|----------|
| `XAI_API_KEY` | the single Grok call (x_search + web_search) |

Pass directly; do *not* rely on a `.env` file unless you explicitly set `XSEARCH_DOTENV=1` first.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | OK |
| 2 | Bad args (missing/empty query) |
| 3 | Missing API key |
| 4 | Provider error (network, HTTP error, rate limit) |

On non-zero exit, stdout contains `{"error":{"code":"...","message":"...","provider":"..."}}`.

## Gotchas

- **Always pays for one LLM round-trip.** Even when you only want URLs, the model is forced to call its search tool and emit a synthesis. There's no "URLs-only" mode. Don't use `x-search` if you just need a generic web lookup and an LLM in the loop is overkill.
- **X-first, not web-first.** The model prioritizes `x_search`. If your query is really a generic web lookup with no X angle, expect mostly `source: "web"` results — and consider whether a plain web search would serve you better.
- **Don't double-shell-quote.** If your query contains double quotes, wrap it in single quotes: `x-search search 'site:example.com "claude opus"'` — not nested doubles.
- **X results return x.com URLs.** They're typically `x.com/<user>/status/<id>`. External links *inside* posts are not separately enumerated — they appear inline in `snippet`.
- **`answer === "No results."` is a real terminal state.** Don't retry the same query; rephrase.
- **`--pretty` output is not machine-stable.** Never invoke with `--pretty` from another agent or pipeline — parse the default JSON.
- **No `--route`, `--full`, `--cost`, `--timeout`, `--model`, `--max-tokens`, etc. exist.** Don't pass them; cac will reject the invocation. The defaults are deliberate.

## When NOT to use

- Query is answerable from training data (definitions, math, well-known general knowledge older than ~6 months).
- You need a non-search action (file edits, code generation, shell ops, calculations).
- You need raw URLs and no LLM synthesis — `x-search` always burns an LLM round-trip.
- The user wants Reddit / HN / Stack Overflow specifically — use a dedicated skill (`reddit-search`, `hn-search`) if available.

## Examples

```bash
# What people on X are saying about a release
x-search search "reactions to Claude 4.7 release on X"

# Real-time replies in a Twitter thread
x-search search "replies to elonmusk latest tweet about Grok"

# X-first, but the model may fall back to web docs if X is thin
x-search search "what people are saying about the B200 release notes"
```

## Recipe: parse the JSON

```bash
result=$(x-search search "reactions to Claude 4.7 on X")

echo "$result" | jq -r '.answer'                  # the synthesis
echo "$result" | jq -r '.results[].url'           # all source URLs
echo "$result" | jq -r '.results[] | select(.source=="x") | .url'   # X-only hits
echo "$result" | jq -r '.citations[].url'         # only URLs the answer cited
echo "$result" | jq -r '.cost_usd'                # log to your budget tracker
```

If `$?` is non-zero, the JSON is an error envelope — parse `.error.code` to branch (`bad_args` → fix call, `missing_api_key` → set env var, `provider_error` → retry).
