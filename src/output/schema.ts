import { z } from "zod";

export const RouteSchema = z.enum(["x", "google", "web"]);
export type Route = z.infer<typeof RouteSchema>;

export const ResultSchema = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  date: z.string().optional(),
  source: z.enum(["x", "web"]),
});
export type Result = z.infer<typeof ResultSchema>;

export const CitationSchema = z.object({
  idx: z.number().int().nonnegative(),
  url: z.string(),
  quote: z.string().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const UsageSchema = z.object({
  in: z.number().int().nonnegative(),
  out: z.number().int().nonnegative(),
  cached: z.number().int().nonnegative(),
  searches: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const SearchEnvelopeSchema = z.object({
  query: z.string(),
  route: RouteSchema,
  model: z.string(),
  results: z.array(ResultSchema),
  answer: z.string(),
  citations: z.array(CitationSchema),
  usage: UsageSchema,
  raw: z.unknown().optional(),
});
export type SearchEnvelope = z.infer<typeof SearchEnvelopeSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    route: RouteSchema.optional(),
    provider: z.string().optional(),
    detail: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
