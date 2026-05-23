import { readFileSync } from "node:fs";

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

export function loadDotenvIfRequested(): void {
  if (process.env.XSEARCH_DOTENV !== "1") return;
  try {
    const txt = readFileSync(".env", "utf8");
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}
