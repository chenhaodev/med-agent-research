import { describe, it, expect } from 'vitest';
import { PubMedProvider, buildPubmedTerm } from '../src/providers/pubmed.ts';
import { installFetchMock } from './fetchMock.ts';
import type { ResearchQuery } from '../../api/types.ts';

const query = (over: Partial<ResearchQuery> = {}): ResearchQuery => ({
  question: 'mobile health', mode: 'keyword', filters: {}, ...over,
});

describe('buildPubmedTerm', () => {
  it('targets the right field per search mode', () => {
    expect(buildPubmedTerm(query({ mode: 'author', question: 'Smith J' }))).toContain('[Author]');
    expect(buildPubmedTerm(query({ mode: 'title', question: 'mHealth' }))).toContain('[Title]');
  });
  it('translates study designs to publication types and excludes preprints', () => {
    const term = buildPubmedTerm(query({ filters: { studyDesigns: ['rct', 'meta-analysis'], excludePreprints: true } }));
    expect(term).toContain('Randomized Controlled Trial[Publication Type]');
    expect(term).toContain('Meta-Analysis[Publication Type]');
    expect(term).toContain('NOT preprint[Publication Type]');
  });
});

describe('PubMedProvider.search', () => {
  it('normalizes esearch + efetch fixtures to Papers with a next cursor', async () => {
    const mock = installFetchMock([
      { match: 'esearch.fcgi', file: 'pubmed-esearch.json' },
      { match: 'efetch.fcgi', file: 'pubmed-efetch.xml', contentType: 'text/xml' },
    ]);
    try {
      const res = await new PubMedProvider().search(query(), { limit: 2 });
      expect(res.items).toHaveLength(2);
      expect(res.total).toBe(139743);
      expect(res.items[0].id).toBe('pubmed:35451347');
      expect(res.items[0].provider).toBe('pubmed');
      expect(res.items.every((p) => p.title && p.title !== '(untitled)')).toBe(true);
      expect(res.nextCursor).toBe('2'); // retstart 0 + 2 ids < 139743
    } finally {
      mock.restore();
    }
  });
});
