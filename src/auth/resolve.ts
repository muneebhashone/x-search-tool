import { getStoredKey, type Provider } from "./store.js";

export const ENV_NAMES: Record<Provider, readonly string[]> = {
  xai: ["XAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
};

export type KeySource = "env" | "store" | "none";

export type ResolvedKey = {
  key?: string;
  source: KeySource;
  envName?: string;
};

export function resolveApiKey(provider: Provider): ResolvedKey {
  for (const name of ENV_NAMES[provider]) {
    const v = process.env[name];
    if (v && v.length > 0) return { key: v, source: "env", envName: name };
  }
  const stored = getStoredKey(provider);
  if (stored && stored.length > 0) return { key: stored, source: "store" };
  return { source: "none" };
}

export function primaryEnvName(provider: Provider): string {
  return ENV_NAMES[provider][0]!;
}
