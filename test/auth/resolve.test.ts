import test from "node:test";
import assert from "node:assert/strict";

import { resolveApiKey, primaryEnvName } from "../../src/auth/resolve.js";
import { setKey } from "../../src/auth/store.js";
import { useTmpConfigDir } from "../helpers/tmp-config.js";

const ENV_VARS = ["XAI_API_KEY"] as const;
type Snap = Record<string, string | undefined>;

function snapshot(): Snap {
  const out: Snap = {};
  for (const k of ENV_VARS) out[k] = process.env[k];
  return out;
}

function restore(snap: Snap): void {
  for (const k of ENV_VARS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k]!;
  }
}

test("resolve: env XAI_API_KEY wins over stored xai key", () => {
  const tmp = useTmpConfigDir();
  const snap = snapshot();
  try {
    setKey("xai", "from-store");
    process.env.XAI_API_KEY = "from-env";
    const r = resolveApiKey("xai");
    assert.equal(r.key, "from-env");
    assert.equal(r.source, "env");
    assert.equal(r.envName, "XAI_API_KEY");
  } finally {
    restore(snap);
    tmp.restore();
  }
});

test("resolve: stored key used when env is empty/absent", () => {
  const tmp = useTmpConfigDir();
  const snap = snapshot();
  try {
    delete process.env.XAI_API_KEY;
    setKey("xai", "stored-only");
    const r = resolveApiKey("xai");
    assert.equal(r.key, "stored-only");
    assert.equal(r.source, "store");
  } finally {
    restore(snap);
    tmp.restore();
  }
});

test("resolve: returns source='none' when neither env nor store set", () => {
  const tmp = useTmpConfigDir();
  const snap = snapshot();
  try {
    for (const k of ENV_VARS) delete process.env[k];
    const r = resolveApiKey("xai");
    assert.equal(r.key, undefined);
    assert.equal(r.source, "none");
  } finally {
    restore(snap);
    tmp.restore();
  }
});

test("resolve: empty-string env var is treated as unset", () => {
  const tmp = useTmpConfigDir();
  const snap = snapshot();
  try {
    process.env.XAI_API_KEY = "";
    setKey("xai", "stored-wins");
    const r = resolveApiKey("xai");
    assert.equal(r.source, "store");
    assert.equal(r.key, "stored-wins");
  } finally {
    restore(snap);
    tmp.restore();
  }
});

test("primaryEnvName: returns first env var per provider", () => {
  assert.equal(primaryEnvName("xai"), "XAI_API_KEY");
});
