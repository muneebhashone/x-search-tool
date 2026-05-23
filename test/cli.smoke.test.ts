import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "dist", "cli.js");

type Run = { exit: number; stdout: string; stderr: string };

function tmpConfig(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "llms-smoke-"));
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

async function runCli(args: string[], env: Record<string, string | undefined> = {}): Promise<Run> {
  return new Promise((resolve) => {
    const merged: Record<string, string | undefined> = { ...process.env, ...env };
    if (!("LLMS_CONFIG_DIR" in env)) {
      merged.LLMS_CONFIG_DIR = mkdtempSync(join(tmpdir(), "llms-smoke-dflt-"));
    }
    const cleanEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) if (v !== undefined) cleanEnv[k] = v;
    const proc = spawn(process.execPath, [CLI, ...args], {
      env: cleanEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ exit: code ?? -1, stdout, stderr }));
  });
}

function parseEnvelope(stdout: string): Record<string, unknown> {
  const line = stdout.trim().split("\n").pop()!;
  return JSON.parse(line);
}

test("cli.smoke: dist/cli.js must exist (run `npm run build` first)", () => {
  assert.equal(existsSync(CLI), true, `expected ${CLI} — did you run npm run build?`);
});

test("cli.smoke: --help exits 0", async () => {
  const r = await runCli(["--help"]);
  assert.equal(r.exit, 0);
  assert.match(r.stdout, /search/);
});

test("cli.smoke: --version exits 0 and prints semver", async () => {
  const r = await runCli(["--version"]);
  assert.equal(r.exit, 0);
  assert.match(r.stdout, /\d+\.\d+\.\d+/);
});

test("cli.smoke: missing --route exits 2 with bad_args envelope", async () => {
  const r = await runCli(["search", "hello"], { XAI_API_KEY: "x", GEMINI_API_KEY: "g" });
  assert.equal(r.exit, 2);
  const env = parseEnvelope(r.stdout);
  assert.equal((env.error as { code: string }).code, "bad_args");
});

test("cli.smoke: bad --route exits 2", async () => {
  const r = await runCli(["search", "hello", "--route", "twitter"], {
    XAI_API_KEY: "x",
    GEMINI_API_KEY: "g",
  });
  assert.equal(r.exit, 2);
  const env = parseEnvelope(r.stdout);
  assert.equal((env.error as { code: string }).code, "bad_args");
});

test("cli.smoke: empty query exits 2", async () => {
  const r = await runCli(["search", "   ", "--route", "x"], { XAI_API_KEY: "x" });
  assert.equal(r.exit, 2);
  const env = parseEnvelope(r.stdout);
  assert.equal((env.error as { code: string }).code, "bad_args");
});

test("cli.smoke: missing XAI_API_KEY for --route x exits 3", async () => {
  const r = await runCli(["search", "hello", "--route", "x"], {
    XAI_API_KEY: undefined,
    GEMINI_API_KEY: undefined,
  });
  assert.equal(r.exit, 3);
  const env = parseEnvelope(r.stdout);
  assert.equal((env.error as { code: string }).code, "missing_api_key");
  assert.equal((env.error as { route: string }).route, "x");
});

test("cli.smoke: missing XAI_API_KEY for --route web exits 3", async () => {
  const r = await runCli(["search", "hello", "--route", "web"], {
    XAI_API_KEY: undefined,
  });
  assert.equal(r.exit, 3);
  const env = parseEnvelope(r.stdout);
  assert.equal((env.error as { code: string }).code, "missing_api_key");
  assert.equal((env.error as { route: string }).route, "web");
});

test("cli.smoke: missing GEMINI_API_KEY for --route google exits 3", async () => {
  const r = await runCli(["search", "hello", "--route", "google"], {
    GEMINI_API_KEY: undefined,
    GOOGLE_API_KEY: undefined,
  });
  assert.equal(r.exit, 3);
  const env = parseEnvelope(r.stdout);
  assert.equal((env.error as { code: string }).code, "missing_api_key");
});

test("cli.smoke: missing key error message points to `llms auth login`", async () => {
  const r = await runCli(["search", "hello", "--route", "x"], { XAI_API_KEY: undefined });
  assert.equal(r.exit, 3);
  const env = parseEnvelope(r.stdout);
  assert.match((env.error as { message: string }).message, /llms auth login --provider xai/);
});

test("cli.smoke: auth status (empty store) exits 0 with no-keys hint", async () => {
  const cfg = tmpConfig();
  try {
    const r = await runCli(["auth", "status"], {
      LLMS_CONFIG_DIR: cfg.dir,
      XAI_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
    });
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /not stored/);
    assert.match(r.stdout, /llms auth login/);
  } finally {
    cfg.cleanup();
  }
});

test("cli.smoke: auth login --provider --key writes store, then search picks it up", async () => {
  const cfg = tmpConfig();
  try {
    const login = await runCli(["auth", "login", "--provider", "xai", "--key", "test-stored-1234"], {
      LLMS_CONFIG_DIR: cfg.dir,
      XAI_API_KEY: undefined,
    });
    assert.equal(login.exit, 0, `login should succeed; got: ${login.stdout}${login.stderr}`);
    assert.match(login.stdout, /Saved xai key/);

    const status = await runCli(["auth", "status"], {
      LLMS_CONFIG_DIR: cfg.dir,
      XAI_API_KEY: undefined,
    });
    assert.equal(status.exit, 0);
    assert.match(status.stdout, /\*\*\*\*1234/, "status must show masked key");
    assert.equal(status.stdout.includes("test-stored"), false, "status must not leak full key");
  } finally {
    cfg.cleanup();
  }
});

test("cli.smoke: auth logout --provider removes one key", async () => {
  const cfg = tmpConfig();
  try {
    await runCli(["auth", "login", "--provider", "xai", "--key", "k1"], {
      LLMS_CONFIG_DIR: cfg.dir,
    });
    await runCli(["auth", "login", "--provider", "gemini", "--key", "k2"], {
      LLMS_CONFIG_DIR: cfg.dir,
    });
    const out = await runCli(["auth", "logout", "--provider", "xai"], {
      LLMS_CONFIG_DIR: cfg.dir,
    });
    assert.equal(out.exit, 0);
    assert.match(out.stdout, /Removed xai key/);

    const status = await runCli(["auth", "status"], {
      LLMS_CONFIG_DIR: cfg.dir,
      XAI_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
    });
    assert.match(status.stdout, /xai\s+not stored/);
    assert.match(status.stdout, /gemini\s+stored/);
  } finally {
    cfg.cleanup();
  }
});

test("cli.smoke: auth logout --all --yes clears everything", async () => {
  const cfg = tmpConfig();
  try {
    await runCli(["auth", "login", "--provider", "xai", "--key", "k1"], { LLMS_CONFIG_DIR: cfg.dir });
    await runCli(["auth", "login", "--provider", "gemini", "--key", "k2"], { LLMS_CONFIG_DIR: cfg.dir });
    const out = await runCli(["auth", "logout", "--all", "--yes"], { LLMS_CONFIG_DIR: cfg.dir });
    assert.equal(out.exit, 0);
    assert.match(out.stdout, /Removed all/);

    const status = await runCli(["auth", "status"], {
      LLMS_CONFIG_DIR: cfg.dir,
      XAI_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
    });
    assert.match(status.stdout, /xai\s+not stored/);
    assert.match(status.stdout, /gemini\s+not stored/);
  } finally {
    cfg.cleanup();
  }
});

test("cli.smoke: auth login with invalid provider exits 2 (bad_args)", async () => {
  const r = await runCli(["auth", "login", "--provider", "openai", "--key", "x"]);
  assert.equal(r.exit, 2);
  const env = parseEnvelope(r.stdout);
  assert.equal((env.error as { code: string }).code, "bad_args");
});

test("cli.smoke: auth login (no flags) in non-TTY exits 2 (bad_args)", async () => {
  const r = await runCli(["auth", "login"]);
  assert.equal(r.exit, 2);
  const env = parseEnvelope(r.stdout);
  assert.equal((env.error as { code: string }).code, "bad_args");
  assert.match((env.error as { message: string }).message, /TTY/);
});

test("cli.smoke: auth unknown action exits 2", async () => {
  const r = await runCli(["auth", "rotate"]);
  assert.equal(r.exit, 2);
  const env = parseEnvelope(r.stdout);
  assert.equal((env.error as { code: string }).code, "bad_args");
});
