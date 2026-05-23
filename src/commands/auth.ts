import { badArgs } from "../errors.js";
import {
  clearAll,
  clearKey,
  configPath,
  load,
  PROVIDERS,
  setKey,
  type Provider,
} from "../auth/store.js";
import { ENV_NAMES, primaryEnvName, resolveApiKey } from "../auth/resolve.js";
import { isInteractive, readHidden, readLine } from "../auth/prompt.js";

export type LoginFlags = {
  provider?: string;
  key?: string;
};

export type LogoutFlags = {
  provider?: string;
  all?: boolean;
  yes?: boolean;
};

export async function login(flags: LoginFlags): Promise<void> {
  let provider: Provider;
  if (flags.provider) {
    provider = parseProvider(flags.provider);
  } else {
    if (!isInteractive()) {
      throw badArgs("--provider is required when stdin is not a TTY");
    }
    const answer = await readLine(`Which provider? (${PROVIDERS.join("/")}): `);
    provider = parseProvider(answer);
  }

  let key: string;
  if (typeof flags.key === "string") {
    key = flags.key.trim();
    if (key.length === 0) throw badArgs("--key must be a non-empty string");
  } else {
    if (!isInteractive()) {
      throw badArgs("--key is required when stdin is not a TTY");
    }
    key = (await readHidden(`Enter ${primaryEnvName(provider)}: `)).trim();
    if (key.length === 0) throw badArgs("key cannot be empty");
  }

  setKey(provider, key);
  process.stdout.write(`Saved ${provider} key to ${configPath()}\n`);
  const envVar = primaryEnvName(provider);
  if (process.env[envVar]) {
    process.stdout.write(`Note: ${envVar} is set in your environment and will take precedence.\n`);
  }
}

export function status(): void {
  const cfg = load();
  const lines: string[] = [];
  let any = false;
  for (const provider of PROVIDERS) {
    const stored = cfg.auth?.[provider]?.api_key;
    const resolved = resolveApiKey(provider);
    const masked = stored ? mask(stored) : "—";
    const storedCol = stored ? `stored ${masked}` : "not stored";
    let note = "";
    if (resolved.source === "env") {
      note = `(env ${resolved.envName} ${stored ? "overrides — using env" : "in use"})`;
    } else if (resolved.source === "store") {
      note = "(in use)";
    }
    if (resolved.source !== "none") any = true;
    lines.push(`  ${provider.padEnd(8)} ${storedCol.padEnd(20)} ${note}`);
  }
  process.stdout.write(`Config file: ${configPath()}\n`);
  process.stdout.write(lines.join("\n") + "\n");
  if (!any) {
    process.stdout.write(
      `\nNo keys available. Run \`x-search auth login --provider ${PROVIDERS[0]}\` to get started.\n`,
    );
  }
}

export async function logout(flags: LogoutFlags): Promise<void> {
  if (flags.all) {
    if (!flags.yes && isInteractive()) {
      const ans = await readLine("Remove ALL stored keys? (y/N): ");
      if (ans.toLowerCase() !== "y" && ans.toLowerCase() !== "yes") {
        process.stdout.write("Cancelled.\n");
        return;
      }
    }
    const removed = clearAll();
    process.stdout.write(removed ? "Removed all stored keys.\n" : "Nothing to remove.\n");
    return;
  }

  if (!flags.provider) {
    throw badArgs("--provider <xai> or --all is required");
  }
  const provider = parseProvider(flags.provider);
  const removed = clearKey(provider);
  process.stdout.write(removed ? `Removed ${provider} key.\n` : `No stored ${provider} key.\n`);
}

function parseProvider(raw: string): Provider {
  const v = raw.trim().toLowerCase();
  for (const p of PROVIDERS) if (v === p) return p;
  throw badArgs(`invalid provider "${raw}". Use one of: ${PROVIDERS.join(", ")}`);
}

function mask(key: string): string {
  if (key.length <= 4) return "****";
  return `****${key.slice(-4)}`;
}

export const _internal = { mask, parseProvider };
export { ENV_NAMES };
