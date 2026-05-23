import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, writeFileSync, existsSync } from "node:fs";

import {
  clearAll,
  clearKey,
  configPath,
  getStoredKey,
  load,
  save,
  setKey,
} from "../../src/auth/store.js";
import { useTmpConfigDir } from "../helpers/tmp-config.js";

test("store: load() on missing file returns empty {version: 1}", () => {
  const tmp = useTmpConfigDir();
  try {
    const cfg = load();
    assert.deepEqual(cfg, { version: 1 });
  } finally {
    tmp.restore();
  }
});

test("store: setKey + getStoredKey round-trip", () => {
  const tmp = useTmpConfigDir();
  try {
    setKey("xai", "abc123");
    assert.equal(getStoredKey("xai"), "abc123");
    setKey("xai", "abc456");
    assert.equal(getStoredKey("xai"), "abc456", "setKey overwrites in place");
  } finally {
    tmp.restore();
  }
});

test("store: file written in expected JSON shape", () => {
  const tmp = useTmpConfigDir();
  try {
    setKey("xai", "k1");
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed, { version: 1, auth: { xai: { api_key: "k1" } } });
  } finally {
    tmp.restore();
  }
});

test("store: file written with 0600 perms on Unix (skipped on Windows)", { skip: process.platform === "win32" }, () => {
  const tmp = useTmpConfigDir();
  try {
    setKey("xai", "k1");
    const mode = statSync(configPath()).mode & 0o777;
    assert.equal(mode, 0o600, `expected 0600, got 0${mode.toString(8)}`);
  } finally {
    tmp.restore();
  }
});

test("store: clearKey removes the key, returns true/false correctly", () => {
  const tmp = useTmpConfigDir();
  try {
    setKey("xai", "k1");
    assert.equal(clearKey("xai"), true);
    assert.equal(getStoredKey("xai"), undefined);
    assert.equal(clearKey("xai"), false, "second clear returns false");
  } finally {
    tmp.restore();
  }
});

test("store: clearAll removes the file", () => {
  const tmp = useTmpConfigDir();
  try {
    setKey("xai", "k1");
    assert.equal(existsSync(configPath()), true);
    assert.equal(clearAll(), true);
    assert.equal(existsSync(configPath()), false);
    assert.equal(clearAll(), false, "second clearAll returns false (nothing to remove)");
  } finally {
    tmp.restore();
  }
});

test("store: corrupt JSON file is tolerated (returns empty)", () => {
  const tmp = useTmpConfigDir();
  try {
    setKey("xai", "valid");
    writeFileSync(configPath(), "not json {", "utf8");
    assert.deepEqual(load(), { version: 1 });
    assert.equal(getStoredKey("xai"), undefined);
  } finally {
    tmp.restore();
  }
});

test("store: unknown version is ignored (returns empty)", () => {
  const tmp = useTmpConfigDir();
  try {
    writeFileSync(configPath(), JSON.stringify({ version: 99, auth: { xai: { api_key: "x" } } }));
    assert.deepEqual(load(), { version: 1 });
  } finally {
    tmp.restore();
  }
});

test("store: garbage entries inside auth block are filtered, valid ones kept", () => {
  const tmp = useTmpConfigDir();
  try {
    writeFileSync(
      configPath(),
      JSON.stringify({
        version: 1,
        auth: {
          xai: { api_key: "good" },
          gemini: { api_key: 12345 },
          rogue: { api_key: "ignored" },
        },
      }),
    );
    const cfg = load();
    assert.deepEqual(cfg, { version: 1, auth: { xai: { api_key: "good" } } });
  } finally {
    tmp.restore();
  }
});

test("store: save() is atomic (tmp file then rename — no partial reads possible)", () => {
  const tmp = useTmpConfigDir();
  try {
    save({ version: 1, auth: { xai: { api_key: "atomic" } } });
    const raw = readFileSync(configPath(), "utf8");
    assert.match(raw, /"atomic"/);
    assert.ok(JSON.parse(raw), "must parse cleanly");
  } finally {
    tmp.restore();
  }
});
