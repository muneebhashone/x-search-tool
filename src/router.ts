import type { RunOptions } from "./config.js";
import type { Route, SearchEnvelope } from "./output/schema.js";

import * as grokX from "./providers/grok-x.js";
import * as grokWeb from "./providers/grok-web.js";
import * as gemini from "./providers/gemini.js";

const ROUTES: Record<Route, (opts: RunOptions) => Promise<SearchEnvelope>> = {
  x: grokX.run,
  web: grokWeb.run,
  google: gemini.run,
};

export async function route(opts: RunOptions): Promise<SearchEnvelope> {
  const fn = ROUTES[opts.route];
  return fn(opts);
}

export const KNOWN_ROUTES: Route[] = ["x", "google", "web"];
