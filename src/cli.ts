#!/usr/bin/env node
import { cac } from "cac";

import { loadDotenvIfRequested, type RunOptions } from "./config.js";
import { ExitCode, LlmsError, badArgs } from "./errors.js";
import { formatCompact, formatErrorCompact } from "./output/compact.js";
import { formatPretty, formatErrorPretty } from "./output/pretty.js";
import { RouteSchema, type ErrorEnvelope, type Route } from "./output/schema.js";
import { KNOWN_ROUTES, route as runRoute } from "./router.js";
import * as authCmd from "./commands/auth.js";

const VERSION = "0.1.0";

type CliFlags = {
  route?: string;
  r?: string;
  pretty?: boolean;
};

async function main(): Promise<void> {
  loadDotenvIfRequested();

  const cli = cac("llms");

  cli
    .command("search <query>", "Search via a specialized LLM-native tool")
    .option("-r, --route <route>", `${KNOWN_ROUTES.join(" | ")}  (required)`)
    .option("--pretty", "Human-readable output (default: JSON for agents)")
    .example('  llms search "latest reactions to Claude 4.7" --route x')
    .example('  llms search "site:nvidia.com B200 release notes" --route google')
    .example('  llms search "Anysphere acquisition news May 2026" --route web')
    .action(async (query: string, flags: CliFlags) => {
      await handleSearch(query, flags);
    });

  cli
    .command("auth <action>", "Manage stored API keys (login | status | logout)")
    .option("--provider <name>", "xai | gemini")
    .option("--key <value>", "API key (skips prompt; use only in scripts)")
    .option("--all", "Remove all stored keys (logout only)")
    .option("--yes", "Skip confirmation prompt for --all (logout only)")
    .example("  llms auth login")
    .example("  llms auth login --provider xai --key sk-...")
    .example("  llms auth status")
    .example("  llms auth logout --provider xai")
    .example("  llms auth logout --all --yes")
    .action(async (action: string, flags: authCmd.LoginFlags & authCmd.LogoutFlags) => {
      try {
        switch (action) {
          case "login":
            await authCmd.login(flags);
            break;
          case "status":
            authCmd.status();
            break;
          case "logout":
            await authCmd.logout(flags);
            break;
          default:
            throw badArgs(`unknown auth action "${action}". Use: login | status | logout`);
        }
        process.exitCode = ExitCode.OK;
      } catch (err) {
        fail(err, false);
      }
    });

  cli.help();
  cli.version(VERSION);

  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    cli.outputHelp();
    process.exit(0);
  }
  const isHelp = argv.some((a) => a === "--help" || a === "-h");
  const isVersion = argv.some((a) => a === "--version" || a === "-v");

  try {
    cli.parse(process.argv, { run: false });
    if (isVersion || isHelp) process.exit(0);
    if (!cli.matchedCommand) {
      throw badArgs(`unknown command. Run \`llms --help\` for usage.`);
    }
    await cli.runMatchedCommand();
  } catch (err) {
    if (err && typeof err === "object" && (err as { name?: string }).name === "CACError") {
      fail(badArgs((err as Error).message), false);
    }
    fail(err, false);
  }
}

async function handleSearch(query: string, flags: CliFlags): Promise<void> {
  const pretty = !!flags.pretty;
  try {
    if (typeof query !== "string" || query.trim().length === 0) {
      throw badArgs("query is required and must be a non-empty string");
    }
    const routeRaw = flags.route ?? flags.r;
    if (!routeRaw) {
      throw badArgs(`--route is required: one of ${KNOWN_ROUTES.join(", ")}`);
    }
    const parsed = RouteSchema.safeParse(routeRaw);
    if (!parsed.success) {
      throw badArgs(`invalid --route "${routeRaw}". Use one of: ${KNOWN_ROUTES.join(", ")}`);
    }
    const route: Route = parsed.data;

    const opts: RunOptions = { query: query.trim(), route };

    const env = await runRoute(opts);

    if (pretty) process.stdout.write(formatPretty(env) + "\n");
    else process.stdout.write(formatCompact(env) + "\n");

    process.exitCode = ExitCode.OK;
    return;
  } catch (err) {
    fail(err, pretty);
  }
}

function fail(err: unknown, pretty: boolean): never {
  let envelope: ErrorEnvelope;
  let exit: number = ExitCode.PROVIDER_ERROR;

  if (err instanceof LlmsError) {
    exit = err.exit;
    const inner: ErrorEnvelope["error"] = {
      code: err.code,
      message: err.message,
    };
    if (err.route) inner.route = err.route;
    if (err.provider) inner.provider = err.provider;
    if (err.detail !== undefined) inner.detail = err.detail;
    envelope = { error: inner };
  } else {
    const msg = err instanceof Error ? err.message : String(err);
    envelope = { error: { code: "internal_error", message: msg } };
  }

  if (pretty) process.stderr.write(formatErrorPretty(envelope) + "\n");
  else process.stdout.write(formatErrorCompact(envelope) + "\n");
  process.exit(exit);
}

main().catch((err) => fail(err, false));
