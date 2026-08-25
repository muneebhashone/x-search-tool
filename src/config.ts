export const DEFAULT_MODEL = "grok-4.3";

export const DEFAULT_MAX_TOKENS = 1024;
export const DEFAULT_RESULTS = 10;
export const DEFAULT_TIMEOUT_MS = 30_000;

export const XAI_BASE_URL = "https://api.x.ai/v1";

export type RunOptions = {
  query: string;
  model?: string;
  maxTokens?: number;
  maxResults?: number;
  noAnswer?: boolean;
  noCache?: boolean;
  media?: boolean;
  timeoutMs?: number;
  full?: boolean;
};

export function resolveModel(override?: string): string {
  return override && override.length > 0 ? override : DEFAULT_MODEL;
}
