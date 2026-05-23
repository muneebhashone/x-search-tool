# llms — LLM-native search CLI

Force an LLM to use *its own* specialized search tool and return sources as JSON. Built for AI agents (one shell call → one JSON envelope). Pass `--pretty` for humans.

## Routes

- **`--route x`** — Grok `x_search`. Real-time X/Twitter index. Nobody else has this.
- **`--route google`** — Gemini `google_search`. Actual Google index, with grounding.
- **`--route web`** — Grok `web_search`. xAI's general web index.

The model is *not* allowed to answer from memory. Tool use is forced via (a) providing only that tool, (b) `tool_choice`, and (c) a strict system prompt.

## Install

```bash
npx llm-optimized-search search "..." --route google
# or
npm i -g llm-optimized-search
llms search "..." --route x
```

## API keys

```bash
export XAI_API_KEY=...      # for --route x and --route web
export GEMINI_API_KEY=...   # for --route google
```

`.env` is loaded only if `LLMS_DOTENV=1`.

## Usage

```text
llms search <query> --route x|google|web [--pretty]
```

That's it. Everything else (model selection, token caps, timeout, caching, parallelism, image/video understanding) is baked in to the cheapest-and-cachiest setting — you don't choose, the tool chooses for you.

## Output

```json
{
  "query": "...",
  "route": "x",
  "results": [{"url":"...","title":"...","snippet":"...","date":"2026-05-22","source":"x"}],
  "answer": "<1–3 sentence synthesis>",
  "citations": [{"url":"...","quote":"..."}],
  "cost_usd": 0.0021
}
```

Exit codes: `0` ok, `2` bad args, `3` missing API key, `4` provider error.

## Examples

```bash
llms search "latest reactions to Claude 4.7" --route x
llms search "site:nvidia.com B200 release notes" --route google
llms search "Anysphere acquisition news May 2026" --route web

# human view
llms search "..." --route google --pretty
```

## Baked-in defaults (you don't touch these)

- Cheapest tool-capable model per route (`grok-4.3`, `gemini-2.5-flash`)
- Prompt caching always on (Gemini implicit on 2.5+; xAI `cached_tokens` automatic)
- `temperature: 0`, `max_output_tokens: 1024`, `parallel_tool_calls: false`, `store: false`
- One search per call; image/video understanding off
- 30 s timeout
- Compact JSON output (short keys, no whitespace)

## For AI agents

A skill file lives at [`skills/llms-search/SKILL.md`](skills/llms-search/SKILL.md). Drop it into your agent's skills directory (e.g. `~/.claude/skills/llms-search/SKILL.md` for Claude Code) and the agent will pick the right route, parse the JSON, and avoid the common gotchas without further prompting.

## License

MIT
