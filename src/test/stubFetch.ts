import { vi } from 'vitest';

export interface StubResponse {
  status?: number;
  body: unknown;
}

export type Handler = (url: string, init?: RequestInit) => StubResponse | Promise<StubResponse> | Error;

/** Replaces global fetch. Handlers are matched by the first substring found in the URL. */
export function stubFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`Unstubbed fetch: ${url}`);
    const out = await routes[key](url, init);
    if (out instanceof Error) throw out;
    return new Response(JSON.stringify(out.body), {
      status: out.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function callsTo(fn: ReturnType<typeof stubFetch>, part: string, method?: string) {
  return fn.mock.calls.filter(([url, init]) => {
    if (!String(url).includes(part)) return false;
    return method ? (init?.method ?? 'GET') === method : true;
  });
}
