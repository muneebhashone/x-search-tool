import type { SearchEnvelope, ErrorEnvelope } from "./schema.js";

export function formatPretty(env: SearchEnvelope): string {
  const lines: string[] = [];
  lines.push(`route: ${env.route}  model: ${env.model}`);
  lines.push(`query: ${env.query}`);
  lines.push("");

  if (env.results.length === 0) {
    lines.push("(no results)");
  } else {
    env.results.forEach((r, i) => {
      const n = String(i + 1).padStart(2, " ");
      lines.push(`${n}. ${r.title || "(untitled)"}`);
      lines.push(`    ${r.url}`);
      if (r.date) lines.push(`    ${r.date}`);
      if (r.snippet) lines.push(`    ${truncate(r.snippet, 240)}`);
    });
  }

  if (env.answer) {
    lines.push("");
    lines.push("---");
    lines.push(env.answer);
  }

  lines.push("");
  lines.push(
    `usage: in=${env.usage.in} out=${env.usage.out} cached=${env.usage.cached} searches=${env.usage.searches} cost=$${env.usage.cost_usd.toFixed(6)}`,
  );

  return lines.join("\n");
}

export function formatErrorPretty(err: ErrorEnvelope): string {
  const e = err.error;
  const parts = [`error: ${e.code}`, e.message];
  if (e.route) parts.push(`route: ${e.route}`);
  if (e.provider) parts.push(`provider: ${e.provider}`);
  return parts.join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
