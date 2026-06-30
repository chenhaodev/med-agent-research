/* BiorxivProvider — adapter over the bioRxiv/medRxiv details API
 * (/details/{server}/{from}/{to}/{cursor}). One class serves both servers.
 *
 * Unlike the other sources, this API has no keyword search — it returns a date
 * window of preprints. The provider fetches a window (derived from the year
 * filters, defaulting to the recent past) and filters by the question locally.
 * This is best-effort preprint coverage, documented as such. Citations are not
 * provided and are left for the enrichment step. */

import type { Paper, ResearchQuery } from '../../../api/types.ts';
import type { LiteratureProvider, PageRequest, PageResult, ProviderCapabilities } from './provider.ts';
import { getJson } from './http.ts';

type Server = 'biorxiv' | 'medrxiv';

interface BxRecord {
  title?: string;
  authors?: string;
  doi?: string;
  date?: string;
  category?: string;
  abstract?: string;
  server?: string;
  version?: string;
}

interface BxResponse {
  messages?: Array<{ cursor?: number | string; count?: number; total?: number | string }>;
  collection?: BxRecord[];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** [from, to] window for the query, defaulting to the last two years. */
export function windowFor(q: ResearchQuery, now: Date = new Date()): { from: string; to: string } {
  const f = q.filters;
  const to = typeof f.yearMax === 'number' ? `${f.yearMax}-12-31` : isoDate(now);
  let from: string;
  if (typeof f.yearMin === 'number') {
    from = `${f.yearMin}-01-01`;
  } else {
    const past = new Date(now);
    past.setFullYear(past.getFullYear() - 2);
    from = isoDate(past);
  }
  return { from, to };
}

function matchesQuestion(p: Paper, question: string): boolean {
  if (!question) return true;
  const needle = question.toLowerCase();
  const hay = `${p.title} ${p.abstract ?? ''} ${p.fields.join(' ')}`.toLowerCase();
  return hay.includes(needle);
}

export function makeNormalizer(server: Server) {
  const domain = server === 'medrxiv' ? 'www.medrxiv.org' : 'www.biorxiv.org';
  return function normalize(r: BxRecord): Paper {
    const doi = r.doi ?? '';
    const year = Number((r.date ?? '').slice(0, 4)) || 0;
    return {
      id: `${server}:${doi}`,
      externalIds: { doi, biorxiv: doi },
      title: r.title ?? '(untitled)',
      abstract: r.abstract,
      authors: (r.authors ?? '')
        .split(';')
        .map((a) => a.trim())
        .filter(Boolean)
        .map((name) => ({ name })),
      year,
      date: r.date,
      venue: { name: r.server ?? server, type: 'preprint' },
      isOpenAccess: true,
      isPreprint: true,
      fields: r.category ? [slugify(r.category)] : [],
      url: doi ? `https://${domain}/content/${doi}` : `https://${domain}`,
      provider: server,
    } satisfies Paper;
  };
}

export class BiorxivProvider implements LiteratureProvider {
  readonly id: Server;
  readonly capabilities: ProviderCapabilities = {
    citations: false,
    quartile: false,
    openAccess: true,
    fullText: true,
    fields: true,
    countries: false,
  };
  private readonly normalize: (r: BxRecord) => Paper;

  constructor(server: Server) {
    this.id = server;
    this.normalize = makeNormalizer(server);
  }

  async search(q: ResearchQuery, page: PageRequest): Promise<PageResult> {
    const { from, to } = windowFor(q);
    const cursor = Number(page.cursor ?? 0) || 0;
    const url = `https://api.biorxiv.org/details/${this.id}/${from}/${to}/${cursor}`;

    const data = await getJson<BxResponse>(url);
    const all = (data.collection ?? []).map(this.normalize);
    const items = all.filter((p) => matchesQuestion(p, q.question.trim()));

    const msg = data.messages?.[0] ?? {};
    const count = Number(msg.count ?? all.length);
    const total = Number(msg.total ?? all.length);
    const nextOffset = cursor + count;

    return {
      items,
      total,
      nextCursor: count > 0 && nextOffset < total ? String(nextOffset) : undefined,
    };
  }

  async fetch(ids: string[]): Promise<Paper[]> {
    const dois = ids
      .filter((id) => id.startsWith(`${this.id}:`))
      .map((id) => id.replace(new RegExp(`^${this.id}:`), ''));
    const results = await Promise.all(
      dois.map((doi) =>
        getJson<BxResponse>(`https://api.biorxiv.org/details/${this.id}/${doi}`)
          .then((d) => (d.collection ?? []).map(this.normalize)[0] ?? null)
          .catch(() => null),
      ),
    );
    return results.filter((p): p is Paper => p !== null);
  }
}
