import test from "node:test";
import assert from "node:assert/strict";

import { ExitCode, XSearchError, badArgs, missingKey, providerError } from "../src/errors.js";

test("ExitCode constants are stable contract values", () => {
  assert.equal(ExitCode.OK, 0);
  assert.equal(ExitCode.BAD_ARGS, 2);
  assert.equal(ExitCode.MISSING_KEY, 3);
  assert.equal(ExitCode.PROVIDER_ERROR, 4);
});

test("badArgs: code=bad_args, exit=2", () => {
  const e = badArgs("missing query");
  assert.ok(e instanceof XSearchError);
  assert.equal(e.code, "bad_args");
  assert.equal(e.exit, 2);
  assert.equal(e.message, "missing query");
});

test("missingKey: code=missing_api_key, exit=3, message names env var + auth command", () => {
  const e = missingKey("XAI_API_KEY");
  assert.equal(e.code, "missing_api_key");
  assert.equal(e.exit, 3);
  assert.match(e.message, /XAI_API_KEY/);
  assert.match(e.message, /x-search auth login/);
});

test("providerError: code=provider_error, exit=4, provider+detail preserved", () => {
  const e = providerError("xAI HTTP 422", {
    provider: "xai",
    detail: { status: 422, body: { error: "bad" } },
  });
  assert.equal(e.code, "provider_error");
  assert.equal(e.exit, 4);
  assert.equal(e.provider, "xai");
  assert.deepEqual(e.detail, { status: 422, body: { error: "bad" } });
});
