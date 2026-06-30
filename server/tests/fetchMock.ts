/* Network-free test harness: serve recorded HTTP fixtures (server/fixtures/http)
 * in place of globalThis.fetch, matched by URL substring. Keeps provider tests
 * deterministic and offline — the recorded responses are real captures
 * (OpenAlex, bioRxiv, PubMed) or schema-accurate samples (Semantic Scholar). */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { vi } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const httpDir = join(here, '..', 'fixtures', 'http');

export interface Route {
  /** Substring (or predicate) the request URL must match. */
  match: string | ((url: string) => boolean);
  /** Fixture filename under fixtures/http, or an inline body. */
  file?: string;
  body?: string;
  status?: number;
  contentType?: string;
}

export function readFixture(file: string): string {
  return readFileSync(join(httpDir, file), 'utf8');
}

function matches(route: Route, url: string): boolean {
  return typeof route.match === 'function' ? route.match(url) : url.includes(route.match);
}

function makeResponse(body: string, status: number, contentType: string): Response {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => JSON.parse(body),
    text: async () => body,
  } as unknown as Response;
}

/** Install a fetch stub for the given routes. Records every requested URL on
 *  `.calls`. Unmatched URLs reject, surfacing missing fixtures loudly. */
export function installFetchMock(routes: Route[]): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const stub = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    const route = routes.find((r) => matches(r, url));
    if (!route) throw new Error(`No fixture route for URL: ${url}`);
    const body = route.body ?? (route.file ? readFixture(route.file) : '');
    return makeResponse(body, route.status ?? 200, route.contentType ?? 'application/json');
  });
  vi.stubGlobal('fetch', stub);
  return { calls, restore: () => vi.unstubAllGlobals() };
}
