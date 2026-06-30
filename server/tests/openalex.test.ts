import { describe, it, expect, afterEach } from 'vitest';
import { OpenAlexProvider, normalizeWork, invertedIndexToText } from '../src/providers/openalex.ts';
import { installFetchMock, readFixture } from './fetchMock.ts';
import type { ResearchQuery } from '../../api/types.ts';

const query = (over: Partial<ResearchQuery> = {}): ResearchQuery => ({
  question: 'mobile health intervention',
  mode: 'keyword',
  filters: {},
  ...over,
});

afterEach(() => {
  /* installFetchMock returns a restore fn; tests that install call it. */
});

describe('invertedIndexToText', () => {
  it('reconstructs text from an inverted index in position order', () => {
    expect(invertedIndexToText({ Hello: [0], world: [1], '!': [2] })).toBe('Hello world !');
    expect(invertedIndexToText({ b: [1], a: [0] })).toBe('a b');
  });
  it('returns undefined when absent', () => {
    expect(invertedIndexToText(null)).toBeUndefined();
    expect(invertedIndexToText(undefined)).toBeUndefined();
  });
});

describe('normalizeWork', () => {
  it('normalizes a recorded OpenAlex work to a Paper', () => {
    const work = JSON.parse(readFixture('openalex-works.json')).results[0];
    const p = normalizeWork(work);
    expect(p.id).toBe('openalex:W2072181779');
    expect(p.externalIds.doi).toBe('10.2196/jmir.1923');
    expect(p.externalIds.pmid).toBe('22209829');
    expect(p.year).toBe(2011);
    expect(p.citationCount).toBe(2025);
    expect(p.isOpenAccess).toBe(true);
    expect(p.isPreprint).toBe(false);
    expect(p.venue.issn).toBe('1438-8871');
    expect(p.venue.type).toBe('journal');
    expect(p.fields).toContain('psychology');
    expect(p.country).toContain('ca');
    expect(p.provider).toBe('openalex');
    expect(p.abstract && p.abstract.length).toBeGreaterThan(0);
  });
});

describe('OpenAlexProvider.search', () => {
  it('returns normalized items, total, and a next cursor', async () => {
    const mock = installFetchMock([{ match: 'api.openalex.org', file: 'openalex-works.json' }]);
    try {
      const res = await new OpenAlexProvider().search(query(), { limit: 2 });
      expect(res.items).toHaveLength(2);
      expect(res.total).toBe(603766);
      expect(res.nextCursor).toBeTruthy();
      // First request starts the cursor at '*'.
      expect(mock.calls[0]).toContain('cursor=*');
      expect(mock.calls[0]).toContain('search=mobile');
    } finally {
      mock.restore();
    }
  });

  it('pushes year + open-access filters into the filter param', async () => {
    const mock = installFetchMock([{ match: 'api.openalex.org', file: 'openalex-works.json' }]);
    try {
      await new OpenAlexProvider().search(
        query({ filters: { yearMin: 2018, openAccess: true, minCitations: 10 } }),
        { limit: 2 },
      );
      const url = decodeURIComponent(mock.calls[0]);
      expect(url).toContain('from_publication_date:2018-01-01');
      expect(url).toContain('is_oa:true');
      expect(url).toContain('cited_by_count:>9');
    } finally {
      mock.restore();
    }
  });
});
