/* Aggregator — fans out across the active providers, merges, dedups by DOI, and
 * applies shared post-filters. Adding a provider here is the only change needed
 * to introduce a new literature source. */

import type { Paper, ResearchQuery } from '../../../api/types.ts';
import { config } from '../config.ts';
import { MockProvider } from './mock.ts';
import { PubMedProvider } from './pubmed.ts';
import {
  applyPostFilters,
  dedupeByDoi,
  type LiteratureProvider,
  type PageRequest,
  type PageResult,
} from './provider.ts';

function activeProviders(): LiteratureProvider[] {
  // USE_LIVE_PUBMED swaps in the real adapter; otherwise everything is mock.
  return config.useLivePubmed ? [new PubMedProvider()] : [new MockProvider()];
}

export class Aggregator {
  private readonly providers: LiteratureProvider[];

  constructor(providers: LiteratureProvider[] = activeProviders()) {
    this.providers = providers;
  }

  async search(q: ResearchQuery, page: PageRequest): Promise<PageResult> {
    const results = await Promise.all(this.providers.map((p) => p.search(q, page)));

    const merged = dedupeByDoi(results.flatMap((r) => r.items));
    const filtered = applyPostFilters(merged, q);

    const total = results.reduce((sum, r) => sum + (r.total ?? r.items.length), 0);
    // A single-provider setup can pass its cursor straight through; multi-provider
    // cursors would need a composite scheme (documented as a follow-up).
    const nextCursor = this.providers.length === 1 ? results[0]?.nextCursor : undefined;

    return { items: filtered, total, nextCursor };
  }

  async fetch(id: string): Promise<Paper | null> {
    for (const provider of this.providers) {
      const [paper] = await provider.fetch([id]);
      if (paper) return paper;
    }
    return null;
  }
}

export const aggregator = new Aggregator();
