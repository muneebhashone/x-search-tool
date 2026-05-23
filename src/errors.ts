import type { Route } from "./output/schema.js";

export const ExitCode = {
  OK: 0,
  BAD_ARGS: 2,
  MISSING_KEY: 3,
  PROVIDER_ERROR: 4,
  NO_RESULTS: 5,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class LlmsError extends Error {
  code: string;
  exit: ExitCodeValue;
  route?: Route;
  provider?: string;
  detail?: unknown;

  constructor(opts: {
    code: string;
    message: string;
    exit: ExitCodeValue;
    route?: Route;
    provider?: string;
    detail?: unknown;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.exit = opts.exit;
    if (opts.route !== undefined) this.route = opts.route;
    if (opts.provider !== undefined) this.provider = opts.provider;
    if (opts.detail !== undefined) this.detail = opts.detail;
  }
}

export const badArgs = (msg: string, detail?: unknown) =>
  new LlmsError({ code: "bad_args", message: msg, exit: ExitCode.BAD_ARGS, detail });

export const missingKey = (envVar: string, route: Route) => {
  const provider = envVar.startsWith("XAI") ? "xai" : "gemini";
  return new LlmsError({
    code: "missing_api_key",
    message: `${envVar} not set. Run \`llms auth login --provider ${provider}\` or export ${envVar}.`,
    exit: ExitCode.MISSING_KEY,
    route,
  });
};

export const providerError = (
  msg: string,
  opts: { route: Route; provider: string; detail?: unknown },
) =>
  new LlmsError({
    code: "provider_error",
    message: msg,
    exit: ExitCode.PROVIDER_ERROR,
    route: opts.route,
    provider: opts.provider,
    detail: opts.detail,
  });
