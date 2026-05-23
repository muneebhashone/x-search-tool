type FetchCall = { url: string; init: RequestInit; body: unknown };

export type MockResponse =
  | { kind: "json"; status: number; body: unknown }
  | { kind: "text"; status: number; body: string }
  | { kind: "throw"; error: Error }
  | { kind: "hang" };

export type FetchMock = {
  calls: FetchCall[];
  restore: () => void;
};

export function mockFetch(responses: MockResponse | MockResponse[]): FetchMock {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const rawBody = init?.body;
    let parsedBody: unknown = rawBody;
    if (typeof rawBody === "string") {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        /* leave as string */
      }
    }
    calls.push({ url, init: init ?? {}, body: parsedBody });

    const next = queue.length > 1 ? queue.shift()! : queue[0]!;

    if (next.kind === "throw") throw next.error;
    if (next.kind === "hang") {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    const bodyStr = next.kind === "json" ? JSON.stringify(next.body) : next.body;
    return new Response(bodyStr, {
      status: next.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
