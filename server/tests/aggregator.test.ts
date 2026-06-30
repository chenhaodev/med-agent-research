import { describe, it, expect } from 'vitest';
import { Aggregator } from '../src/providers/aggregator.ts';
import { decodeCursor } from '../src/providers/cursor.ts';
import { SjrEnricher } from '../src/providers/enrichers/sjr.ts';
import type { Paper, ResearchQuery } from '../../api/types.ts';
import type { LiteratureProvider, PageRequest, PageResult, ProviderCapabilities } from '../src/providers/provider.ts';

const CAPS: ProviderCapabilities = {
  citations: true, quartile: false, openAccess: true, fullText: false, fields: true, countries: true,
};

function paper(over: Partial<Paper> & { id: string }): Paper {
  return {
    externalIds: {}, title: 't', authors: [], year: 2020, isOpenAccess: false, isPreprint: false,
    fields: [], url: 'u', provider: 'test', venue: { name: 'V', type: 'journal' },
    ...over,
  };
}

class FakeProvider implements LiteratureProvider {
  readonly capabilities = CAPS;
  lastCursor: string | undefined;
  constructor(
    readonly id: string,
    private readonly result: PageResult,
  ) {}
  async search(_q: ResearchQuery, page: PageRequest): Promise<PageResult> {
    this.lastCursor = page.cursor;
    return this.result;
  }
  async fetch(): Promise<Paper[]> {
    return [];
  }
}

class ThrowingProvider implements LiteratureProvider {
  readonly id = 'boom';
  readonly capabilities = CAPS;
  async search(): Promise<PageResult> {
    throw new Error('provider down');
  }
  async fetch(): Promise<Paper[]> {
    return [];
  }
}

const query = (over: Partial<ResearchQuery> = {}): ResearchQuery => ({
  question: 'q', mode: 'keyword', filters: {}, ...over,
});

describe('Aggregator', () => {
  it('dedups by DOI across providers, keeping the most-cited copy', async () => {
    const a = new FakeProvider('a', {
      items: [paper({ id: 'a:1', externalIds: { doi: '10.1/x' }, citationCount: 5 })],
      total: 1, nextCursor: 'A2',
    });
    const b = new FakeProvider('b', {
      items: [
        paper({ id: 'b:1', externalIds: { doi: '10.1/x' }, citationCount: 9 }),
        paper({ id: 'b:2', externalIds: { doi: '10.1/y' }, citationCount: 1 }),
      ],
      total: 2, nextCursor: 'B3',
    });
    const agg = new Aggregator([a, b], []);
    const res = await agg.search(query(), { limit: 10 });

    const dois = res.items.map((p) => p.externalIds.doi).sort();
    expect(dois).toEqual(['10.1/x', '10.1/y']);
    const x = res.items.find((p) => p.externalIds.doi === '10.1/x')!;
    expect(x.citationCount).toBe(9); // higher-citation copy won the dedup
    expect(res.total).toBe(3); // summed across providers
  });

  it('bundles per-provider cursors and routes them back on the next page', async () => {
    const a = new FakeProvider('a', { items: [], total: 0, nextCursor: 'A2' });
    const b = new FakeProvider('b', { items: [], total: 0, nextCursor: 'B3' });
    const agg = new Aggregator([a, b], []);

    const res = await agg.search(query(), { limit: 10 });
    expect(decodeCursor(res.nextCursor)).toEqual({ a: 'A2', b: 'B3' });

    await agg.search(query(), { limit: 10, cursor: res.nextCursor });
    expect(a.lastCursor).toBe('A2');
    expect(b.lastCursor).toBe('B3');
  });

  it('runs enrichers over the merged set before filtering', async () => {
    const a = new FakeProvider('a', {
      items: [paper({ id: 'a:1', venue: { name: 'JMIR', type: 'journal', issn: '1438-8871' } })],
      total: 1,
    });
    const agg = new Aggregator([a], [new SjrEnricher({ '1438-8871': 'Q1' })]);
    const res = await agg.search(query(), { limit: 10 });
    expect(res.items[0].venue.quartile).toBe('Q1');
  });

  it('applies post-filters (journalRank works on enriched quartiles)', async () => {
    const a = new FakeProvider('a', {
      items: [
        paper({ id: 'a:1', venue: { name: 'JMIR', type: 'journal', issn: '1438-8871' } }), // -> Q1
        paper({ id: 'a:2', venue: { name: 'Other', type: 'journal', issn: '0000-0000' } }), // no quartile
      ],
      total: 2,
    });
    const agg = new Aggregator([a], [new SjrEnricher({ '1438-8871': 'Q1' })]);
    const res = await agg.search(query({ filters: { journalRank: 'q1' } }), { limit: 10 });
    expect(res.items.map((p) => p.id)).toEqual(['a:1']);
  });

  it('survives a provider that throws (one bad source does not sink the search)', async () => {
    const good = new FakeProvider('good', {
      items: [paper({ id: 'good:1', externalIds: { doi: '10.2/z' } })],
      total: 1, nextCursor: 'G2',
    });
    const agg = new Aggregator([new ThrowingProvider(), good], []);
    const res = await agg.search(query(), { limit: 10 });
    expect(res.items.map((p) => p.id)).toEqual(['good:1']);
    expect(decodeCursor(res.nextCursor)).toEqual({ good: 'G2' });
  });
});
