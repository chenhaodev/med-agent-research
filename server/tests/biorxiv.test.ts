import { describe, it, expect } from 'vitest';
import { BiorxivProvider, makeNormalizer, windowFor } from '../src/providers/biorxiv.ts';
import { installFetchMock, readFixture } from './fetchMock.ts';
import type { ResearchQuery } from '../../api/types.ts';

const query = (over: Partial<ResearchQuery> = {}): ResearchQuery => ({
  question: '',
  mode: 'keyword',
  filters: {},
  ...over,
});

describe('windowFor', () => {
  const now = new Date('2026-06-30T00:00:00Z');

  it('uses explicit year bounds when provided', () => {
    expect(windowFor(query({ filters: { yearMin: 2020, yearMax: 2024 } }), now)).toEqual({
      from: '2020-01-01',
      to: '2024-12-31',
    });
  });

  it('defaults to a two-year window ending today', () => {
    expect(windowFor(query(), now)).toEqual({ from: '2024-06-30', to: '2026-06-30' });
  });
});

describe('makeNormalizer', () => {
  it('normalizes a recorded bioRxiv record to a preprint Paper', () => {
    const record = JSON.parse(readFixture('biorxiv-details.json')).collection[0];
    const p = makeNormalizer('biorxiv')(record);
    expect(p.id).toBe('biorxiv:10.1101/2023.12.30.573731');
    expect(p.isPreprint).toBe(true);
    expect(p.isOpenAccess).toBe(true);
    expect(p.venue.type).toBe('preprint');
    expect(p.fields).toEqual(['neuroscience']);
    expect(p.authors.length).toBeGreaterThan(1);
    expect(p.url).toContain('biorxiv.org/content/');
    expect(p.provider).toBe('biorxiv');
  });
});

describe('BiorxivProvider.search', () => {
  it('returns all records in the window when there is no question, with a next cursor', async () => {
    const mock = installFetchMock([{ match: 'api.biorxiv.org/details', file: 'biorxiv-details.json' }]);
    try {
      const res = await new BiorxivProvider('biorxiv').search(query(), { limit: 30 });
      expect(res.items).toHaveLength(3);
      expect(res.total).toBe(645);
      expect(res.nextCursor).toBe('30'); // cursor 0 + count 30 < total 645
    } finally {
      mock.restore();
    }
  });

  it('filters the window by the question locally', async () => {
    const mock = installFetchMock([{ match: 'api.biorxiv.org/details', file: 'biorxiv-details.json' }]);
    try {
      const hit = await new BiorxivProvider('biorxiv').search(query({ question: 'KCNQ2' }), { limit: 30 });
      expect(hit.items).toHaveLength(1); // distinctive token in record 0 only
      const miss = await new BiorxivProvider('biorxiv').search(query({ question: 'zzz-no-match' }), { limit: 30 });
      expect(miss.items).toHaveLength(0);
    } finally {
      mock.restore();
    }
  });
});
