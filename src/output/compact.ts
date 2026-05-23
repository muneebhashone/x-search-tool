import type { SearchEnvelope, ErrorEnvelope } from "./schema.js";

type CompactCitation = { url: string; quote?: string };
type CompactPayload = {
  query: string;
  results: SearchEnvelope["results"];
  answer: string;
  citations: CompactCitation[];
  cost_usd: number;
};

export function formatCompact(env: SearchEnvelope): string {
  const payload: CompactPayload = {
    query: env.query,
    results: env.results,
    answer: env.answer,
    citations: env.citations.map((c) => {
      const out: CompactCitation = { url: c.url };
      if (c.quote) out.quote = c.quote;
      return out;
    }),
    cost_usd: env.usage.cost_usd,
  };
  return JSON.stringify(payload);
}

export function formatErrorCompact(err: ErrorEnvelope): string {
  return JSON.stringify(err);
}
