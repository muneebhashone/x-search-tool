import test from "node:test";
import assert from "node:assert/strict";

import * as authCmd from "../../src/commands/auth.js";
import { getStoredKey, setKey } from "../../src/auth/store.js";
import { useTmpConfigDir } from "../helpers/tmp-config.js";

type Captured = { stdout: string; stderr: string };

function captureIO(): { captured: Captured; restore: () => void } {
  const captured: Captured = { stdout: "", stderr: "" };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    captured.stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    captured.stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stderr.write;
  return {
    captured,
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

test("login --provider xai --key writes store and reports config path", async () => {
  const tmp = useTmpConfigDir();
  const io = captureIO();
  try {
    await authCmd.login({ provider: "xai", key: "test-fixture" });
    assert.equal(getStoredKey("xai"), "test-fixture");
    io.restore();
    assert.match(io.captured.stdout, /Saved xai key/);
    assert.match(io.captured.stdout, /config\.json/);
  } finally {
    io.restore();
    tmp.restore();
  }
});

test("login: invalid provider rejected as bad_args", async () => {
  const tmp = useTmpConfigDir();
  try {
    await assert.rejects(
      authCmd.login({ provider: "openai", key: "x" }),
      (err: Error & { code?: string; exit?: number }) => {
        assert.equal(err.code, "bad_args");
        assert.equal(err.exit, 2);
        return true;
      },
    );
  } finally {
    tmp.restore();
  }
});

test("login: empty --key rejected as bad_args", async () => {
  const tmp = useTmpConfigDir();
  try {
    await assert.rejects(
      authCmd.login({ provider: "xai", key: "   " }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "bad_args");
        return true;
      },
    );
  } finally {
    tmp.restore();
  }
});

test("login: missing --provider in non-TTY rejected as bad_args", async () => {
  const tmp = useTmpConfigDir();
  const origTTY = process.stdin.isTTY;
  try {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    await assert.rejects(
      authCmd.login({ key: "x" }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "bad_args");
        assert.match(err.message, /TTY/);
        return true;
      },
    );
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: origTTY, configurable: true });
    tmp.restore();
  }
});

test("login: missing --key in non-TTY rejected as bad_args", async () => {
  const tmp = useTmpConfigDir();
  const origTTY = process.stdin.isTTY;
  try {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    await assert.rejects(
      authCmd.login({ provider: "xai" }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "bad_args");
        assert.match(err.message, /TTY/);
        return true;
      },
    );
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: origTTY, configurable: true });
    tmp.restore();
  }
});

test("status: empty store prints hint about login", () => {
  const tmp = useTmpConfigDir();
  const io = captureIO();
  try {
    authCmd.status();
    io.restore();
    assert.match(io.captured.stdout, /not stored/);
    assert.match(io.captured.stdout, /x-search auth login/);
  } finally {
    io.restore();
    tmp.restore();
  }
});

test("status: stored key shown masked (last 4 chars only)", () => {
  const tmp = useTmpConfigDir();
  const io = captureIO();
  try {
    setKey("xai", "abcdefghijklmnop");
    authCmd.status();
    io.restore();
    assert.match(io.captured.stdout, /\*\*\*\*mnop/, "must show masked last-4");
    assert.equal(io.captured.stdout.includes("abcdefgh"), false, "must NOT leak the full key");
  } finally {
    io.restore();
    tmp.restore();
  }
});

test("status: env var presence noted in output (env wins over store)", () => {
  const tmp = useTmpConfigDir();
  const io = captureIO();
  const prior = process.env.XAI_API_KEY;
  try {
    setKey("xai", "stored-value-xxxx");
    process.env.XAI_API_KEY = "env-value";
    authCmd.status();
    io.restore();
    assert.match(io.captured.stdout, /env XAI_API_KEY overrides/);
  } finally {
    io.restore();
    if (prior === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = prior;
    tmp.restore();
  }
});

test("logout --provider removes the stored key", async () => {
  const tmp = useTmpConfigDir();
  const io = captureIO();
  try {
    setKey("xai", "k1");
    await authCmd.logout({ provider: "xai", yes: true });
    io.restore();
    assert.equal(getStoredKey("xai"), undefined);
    assert.match(io.captured.stdout, /Removed xai key/);
  } finally {
    io.restore();
    tmp.restore();
  }
});

test("logout --all --yes removes everything without prompting", async () => {
  const tmp = useTmpConfigDir();
  const io = captureIO();
  try {
    setKey("xai", "k1");
    await authCmd.logout({ all: true, yes: true });
    io.restore();
    assert.equal(getStoredKey("xai"), undefined);
    assert.match(io.captured.stdout, /Removed all stored keys/);
  } finally {
    io.restore();
    tmp.restore();
  }
});

test("logout: no --provider and no --all is bad_args", async () => {
  const tmp = useTmpConfigDir();
  try {
    await assert.rejects(
      authCmd.logout({}),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "bad_args");
        return true;
      },
    );
  } finally {
    tmp.restore();
  }
});
