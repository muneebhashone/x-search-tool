import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync, unlinkSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Provider = "xai";
export const PROVIDERS: readonly Provider[] = ["xai"];

export type StoredAuth = { api_key: string };
export type ConfigFile = {
  version: 1;
  auth?: Partial<Record<Provider, StoredAuth>>;
};

const CONFIG_FILENAME = "config.json";

export function configDir(): string {
  const override = process.env.XSEARCH_CONFIG_DIR;
  if (override && override.length > 0) return override;
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0 && process.platform !== "win32") return join(xdg, "x-search");
  return join(homedir(), ".x-search");
}

export function configPath(): string {
  return join(configDir(), CONFIG_FILENAME);
}

export function load(): ConfigFile {
  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ConfigFile>;
    if (typeof parsed !== "object" || parsed === null) return { version: 1 };
    if (parsed.version !== 1) return { version: 1 };
    const out: ConfigFile = { version: 1 };
    if (parsed.auth && typeof parsed.auth === "object") {
      const auth: Partial<Record<Provider, StoredAuth>> = {};
      for (const p of PROVIDERS) {
        const entry = parsed.auth[p];
        if (entry && typeof entry === "object" && typeof entry.api_key === "string") {
          auth[p] = { api_key: entry.api_key };
        }
      }
      if (Object.keys(auth).length > 0) out.auth = auth;
    }
    return out;
  } catch {
    return { version: 1 };
  }
}

export function save(cfg: ConfigFile): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const path = configPath();
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", { encoding: "utf8" });
  if (process.platform !== "win32") {
    try {
      chmodSync(tmp, 0o600);
    } catch {
      /* best effort */
    }
  }
  renameSync(tmp, path);
}

export function setKey(provider: Provider, apiKey: string): void {
  const cfg = load();
  const auth = cfg.auth ?? {};
  auth[provider] = { api_key: apiKey };
  cfg.auth = auth;
  save(cfg);
}

export function clearKey(provider: Provider): boolean {
  const cfg = load();
  if (!cfg.auth || !cfg.auth[provider]) return false;
  delete cfg.auth[provider];
  if (Object.keys(cfg.auth).length === 0) delete cfg.auth;
  save(cfg);
  return true;
}

export function clearAll(): boolean {
  const path = configPath();
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

export function getStoredKey(provider: Provider): string | undefined {
  const cfg = load();
  return cfg.auth?.[provider]?.api_key;
}
