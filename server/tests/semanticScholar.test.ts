import { describe, it, expect } from 'vitest';
import { SemanticScholarProvider, normalizeS2 } from '../src/providers/semanticScholar.ts';
import { installFetchMock, readFixture } from './fetchMock.ts';
import type { ResearchQuery } from '../../api/types.ts';

const query = (over: Partial<ResearchQuery> = {}): ResearchQuery => ({
  question: 'mobile health',
  mode: 'keyword',
  filters: {},
  ...over,
});

describe('normalizeS2', () => {
  const data = JSON.parse(readFixture('semanticscholar-search.json')).data;

  it('normalizes a journal review', () => {
    const p = normalizeS2(data[0]);
    expect(p.id).toBe('s2:5f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a');
    expect(p.externalIds.doi).toBe('10.2196/jmir.1923');
    expect(p.externalIds.pmid).toBe('22209829');
    expect(p.citationCount).toBe(2025);
    expect(p.isOpenAccess).toBe(true);
    expect(p.isPreprint).toBe(false);
    expect(p.fields).toEqual(['medicine', 'computer-science']);
    expect(p.studyDesign).toBe('review');
    expect(p.provider).toBe('semantic-scholar');
  });

  it('flags a medRxiv clinical trial as a preprint RCT', () => {
    const p = normalizeS2(data[1]);
    expect(p.isPreprint).toBe(true);
    expect(p.venue.type).toBe('preprint');
    expect(p.studyDesign).toBe('rct');
  });
});

describe('SemanticScholarProvider.search', () => {
  it('returns normalized items, total, and the next offset cursor', async () => {
    const mock = installFetchMock([{ match: '/paper/search', file: 'semanticscholar-search.json' }]);
    try {
      const res = await new SemanticScholarProvider().search(query(), { limit: 2 });
      expect(res.items).toHaveLength(2);
      expect(res.total).toBe(15842);
      expect(res.nextCursor).toBe('2');
      expect(mock.calls[0]).toContain('offset=0');
    } finally {
      mock.restore();
    }
  });

  it('short-circuits an empty question without hitting the network', async () => {
    const mock = installFetchMock([{ match: '/paper/search', file: 'semanticscholar-search.json' }]);
    try {
      const res = await new SemanticScholarProvider().search(query({ question: '  ' }), { limit: 2 });
      expect(res.items).toEqual([]);
      expect(mock.calls).toHaveLength(0);
    } finally {
      mock.restore();
    }
  });
});
