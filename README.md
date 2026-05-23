# x-search — X-first search CLI

Force Grok to run an **X-first** search and return sources as JSON. Built for AI agents (one shell call → one JSON envelope). Pass `--pretty` for humans.

## How it works

One call hands the Grok model **two** tools in a single request:

- **`x_search`** — Grok's real-time X/Twitter index. The primary tool. Nobody else has this.
- **`web_search`** — Grok's general web index. The model is instructed to use it **only as a fallback**, when X results are absent or insufficient.

The model is *not* allowed to answer from memory. Tool use is forced via `tool_choice: "required"` and a strict system prompt that prioritizes X. Every result is tagged `source: "x"` or `source: "web"` so you know where each hit came from.

## Install

Not on npm — install from source. `npm link` is the Node/npm equivalent of `bun link`:

```bash
git clone git@github.com:muneebhashone/x-search-tool.git && cd x-search-tool
npm install && npm run build
npm link        # registers a global `x-search` symlink to this checkout
x-search search "reactions to Claude 4.7 on X"
```

`npm unlink -g x-search-tool` removes it. `yarn link` / `pnpm link --global` work the same way.

## API key

One key. `x-search search` resolves it in this order: env var → `x-search auth` store → error.

**For humans** (persisted to `~/.x-search/config.json`, file-perm `0600`):

```bash
x-search auth login                              # interactive: asks provider + key (hidden input)
x-search auth login --provider xai --key sk-...  # non-interactive (scripts)
x-search auth status                             # show what's stored (last-4 masked)
x-search auth logout --provider xai              # remove it
x-search auth logout --all --yes                 # remove everything
```

**For agents / CI** (env vars always win, so a stored key won't override a deliberate env):

```bash
export XAI_API_KEY=...      # the only key x-search needs
```

`.env` is loaded only if `XSEARCH_DOTENV=1`.

## Usage

```text
x-search search <query> [--pretty]
```

That's it — no route, no other flags. Everything else (model selection, token caps, timeout, caching, parallelism, image/video understanding) is baked in to the cheapest-and-cachiest setting — you don't choose, the tool chooses for you.

## Output

```json
{
  "query": "...",
  "results": [{"url":"...","title":"...","snippet":"...","date":"2026-05-22","source":"x"}],
  "answer": "<1–3 sentence synthesis>",
  "citations": [{"url":"...","quote":"..."}],
  "cost_usd": 0.0021
}
```

Each result's `source` is `"x"` (X/Twitter) or `"web"` (fallback). Exit codes: `0` ok, `2` bad args, `3` missing API key, `4` provider error.

## Examples

```bash
x-search search "latest reactions to Claude 4.7 on X"
x-search search "replies to elonmusk latest tweet about Grok"

# human view
x-search search "what's trending in AI on X" --pretty
```

## Baked-in defaults (you don't touch these)

- Cheapest tool-capable model (`grok-4.3`)
- Both `x_search` and `web_search` offered in one call; X prioritized via the system prompt
- Prompt caching always on (xAI `cached_tokens` automatic)
- `temperature: 0`, `max_output_tokens: 1024`, `parallel_tool_calls: false`, `store: false`
- Image/video understanding off
- 30 s timeout
- Compact JSON output (short keys, no whitespace)

## For AI agents

A skill file lives at [`skills/x-search/SKILL.md`](skills/x-search/SKILL.md). It teaches the agent to call the tool, parse the JSON, and avoid the common gotchas without further prompting.

Install via [skills.sh](https://www.skills.sh/docs) (one command, auto-detects your agent):

```bash
npx skills add muneebhashone/x-search-tool           # project scope → ./<agent>/skills/
npx skills add -g muneebhashone/x-search-tool        # global scope  → ~/<agent>/skills/
```

Or drop `skills/x-search/SKILL.md` into your agent's skills directory manually (e.g. `~/.claude/skills/x-search/SKILL.md` for Claude Code).

## License

MIT
