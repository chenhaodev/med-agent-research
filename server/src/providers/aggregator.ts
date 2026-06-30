/* Aggregator — fans out across the active providers in parallel, merges, dedups
 * by DOI, runs enrichers (e.g. SJR quartiles), and applies shared post-filters.
 *
 * Pagination uses a composite cursor: each provider keeps its own native cursor,
 * bundled into one opaque string the client round-trips. A provider that runs
 * dry drops out of the bundle; when the bundle is empty there is no next page. */

import type { Paper, ResearchQuery } from '../../../api/types.ts';
import {
  applyPostFilters,
  dedupeByDoi,
  type LiteratureProvider,
  type PageRequest,
  type PageResult,
  type PaperEnricher,
} from './provider.ts';
import { decodeCursor, encodeCursor, type ProviderCursors } from './cursor.ts';
import { resolveProviders, resolveEnrichers } from './registry.ts';

export class Aggregator {
  private readonly providers: LiteratureProvider[];
  private readonly enrichers: PaperEnricher[];

  constructor(
    providers: LiteratureProvider[] = resolveProviders(),
    enrichers: PaperEnricher[] = resolveEnrichers(),
  ) {
    this.providers = providers;
    this.enrichers = enrichers;
  }

  async search(q: ResearchQuery, page: PageRequest): Promise<PageResult> {
    const cursors = decodeCursor(page.cursor);

    // Fan out; a single provider failing must not sink the whole search.
    const settled = await Promise.allSettled(
      this.providers.map((p) => p.search(q, { cursor: cursors[p.id], limit: page.limit })),
    );

    const nextCursors: ProviderCursors = {};
    let total = 0;
    const collected: Paper[] = [];

    settled.forEach((result, i) => {
      const provider = this.providers[i];
      if (result.status !== 'fulfilled') return;
      const r = result.value;
      collected.push(...r.items);
      total += r.total ?? r.items.length;
      if (r.nextCursor) nextCursors[provider.id] = r.nextCursor;
    });

    const merged = dedupeByDoi(collected);
    const enriched = await this.runEnrichers(merged);
    const filtered = applyPostFilters(enriched, q);

    return { items: filtered, total, nextCursor: encodeCursor(nextCursors) };
  }

  async fetch(id: string): Promise<Paper | null> {
    for (const provider of this.providers) {
      try {
        const [paper] = await provider.fetch([id]);
        if (paper) {
          const [enriched] = await this.runEnrichers([paper]);
          return enriched ?? paper;
        }
      } catch {
        // try the next provider
      }
    }
    return null;
  }

  private async runEnrichers(papers: Paper[]): Promise<Paper[]> {
    let acc = papers;
    for (const enricher of this.enrichers) {
      acc = await enricher.enrich(acc);
    }
    return acc;
  }
}

export const aggregator = new Aggregator();
