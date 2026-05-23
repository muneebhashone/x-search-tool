export const ExitCode = {
  OK: 0,
  BAD_ARGS: 2,
  MISSING_KEY: 3,
  PROVIDER_ERROR: 4,
  NO_RESULTS: 5,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class XSearchError extends Error {
  code: string;
  exit: ExitCodeValue;
  provider?: string;
  detail?: unknown;

  constructor(opts: {
    code: string;
    message: string;
    exit: ExitCodeValue;
    provider?: string;
    detail?: unknown;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.exit = opts.exit;
    if (opts.provider !== undefined) this.provider = opts.provider;
    if (opts.detail !== undefined) this.detail = opts.detail;
  }
}

export const badArgs = (msg: string, detail?: unknown) =>
  new XSearchError({ code: "bad_args", message: msg, exit: ExitCode.BAD_ARGS, detail });

export const missingKey = (envVar: string = "XAI_API_KEY") =>
  new XSearchError({
    code: "missing_api_key",
    message: `${envVar} not set. Run \`x-search auth login --provider xai\` or export ${envVar}.`,
    exit: ExitCode.MISSING_KEY,
  });

export const providerError = (
  msg: string,
  opts: { provider: string; detail?: unknown },
) =>
  new XSearchError({
    code: "provider_error",
    message: msg,
    exit: ExitCode.PROVIDER_ERROR,
    provider: opts.provider,
    detail: opts.detail,
  });
