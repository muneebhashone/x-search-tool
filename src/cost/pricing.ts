export type ModelPricing = {
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok?: number;
  per_search_usd?: number;
};

export const XAI_PRICING: Record<string, ModelPricing> = {
  "grok-4.3": { input_per_mtok: 1.25, output_per_mtok: 2.5 },
  "grok-4.20-0309-reasoning": { input_per_mtok: 1.25, output_per_mtok: 2.5 },
  "grok-4.20-0309-non-reasoning": { input_per_mtok: 1.25, output_per_mtok: 2.5 },
  "grok-4-1-fast": { input_per_mtok: 1.25, output_per_mtok: 2.5 },
  "grok-build-0.1": { input_per_mtok: 1.0, output_per_mtok: 2.0 },
};

export type CostInput = {
  model: string;
  provider: "xai";
  in_tokens: number;
  cached_tokens: number;
  out_tokens: number;
  searches: number;
};

export function computeCostUsd(c: CostInput): number {
  const p = XAI_PRICING[c.model];
  if (!p) return 0;
  const billable_in = Math.max(0, c.in_tokens - c.cached_tokens);
  const cached_rate = p.cached_input_per_mtok ?? p.input_per_mtok * 0.1;
  const inCost = (billable_in * p.input_per_mtok) / 1_000_000;
  const cachedCost = (c.cached_tokens * cached_rate) / 1_000_000;
  const outCost = (c.out_tokens * p.output_per_mtok) / 1_000_000;
  const searchCost = c.searches * (p.per_search_usd ?? 0);
  return round6(inCost + cachedCost + outCost + searchCost);
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
