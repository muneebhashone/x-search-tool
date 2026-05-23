import test from "node:test";
import assert from "node:assert/strict";

import { ExitCode, LlmsError, badArgs, missingKey, providerError } from "../src/errors.js";

test("ExitCode constants are stable contract values", () => {
  assert.equal(ExitCode.OK, 0);
  assert.equal(ExitCode.BAD_ARGS, 2);
  assert.equal(ExitCode.MISSING_KEY, 3);
  assert.equal(ExitCode.PROVIDER_ERROR, 4);
});

test("badArgs: code=bad_args, exit=2", () => {
  const e = badArgs("missing route");
  assert.ok(e instanceof LlmsError);
  assert.equal(e.code, "bad_args");
  assert.equal(e.exit, 2);
  assert.equal(e.message, "missing route");
});

test("missingKey: code=missing_api_key, exit=3, route preserved, message names env var", () => {
  const e = missingKey("XAI_API_KEY", "x");
  assert.equal(e.code, "missing_api_key");
  assert.equal(e.exit, 3);
  assert.equal(e.route, "x");
  assert.match(e.message, /XAI_API_KEY/);
});

test("providerError: code=provider_error, exit=4, route+provider+detail preserved", () => {
  const e = providerError("xAI HTTP 422", {
    route: "x",
    provider: "xai",
    detail: { status: 422, body: { error: "bad" } },
  });
  assert.equal(e.code, "provider_error");
  assert.equal(e.exit, 4);
  assert.equal(e.route, "x");
  assert.equal(e.provider, "xai");
  assert.deepEqual(e.detail, { status: 422, body: { error: "bad" } });
});
