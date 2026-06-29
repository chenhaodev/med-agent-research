/* MockProvider — serves the bundled paper fixtures. Default provider for the
 * mock server. Supports keyword/title/author matching and offset cursors. */

import type { Paper, ResearchQuery } from '../../../api/types.ts';
import { papersFixture } from '../fixtures.ts';
import type { LiteratureProvider, PageRequest, PageResult, ProviderCapabilities } from './provider.ts';

function matchesQuery(p: Paper, q: ResearchQuery): boolean {
  const needle = q.question.trim().toLowerCase();
  if (!needle) return true;
  const inAuthors = p.authors.some((a) => a.name.toLowerCase().includes(needle));
  switch (q.mode) {
    case 'author':
      return inAuthors;
    case 'title':
      return p.title.toLowerCase().includes(needle);
    default: {
      // phrase / keyword / methods: search title + abstract + authors
      const hay = `${p.title} ${p.abstract ?? ''} ${p.authors.map((a) => a.name).join(' ')}`.toLowerCase();
      return hay.includes(needle);
    }
  }
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

export class MockProvider implements LiteratureProvider {
  readonly id = 'mock';
  readonly capabilities: ProviderCapabilities = {
    citations: true,
    quartile: true,
    openAccess: true,
    fullText: false,
    fields: true,
    countries: true,
  };

  async search(q: ResearchQuery, page: PageRequest): Promise<PageResult> {
    const matched = papersFixture.filter((p) => matchesQuery(p, q));
    const offset = decodeCursor(page.cursor);
    const slice = matched.slice(offset, offset + page.limit);
    const nextOffset = offset + slice.length;
    return {
      items: slice,
      total: matched.length,
      nextCursor: nextOffset < matched.length ? encodeCursor(nextOffset) : undefined,
    };
  }

  async fetch(ids: string[]): Promise<Paper[]> {
    const set = new Set(ids);
    return papersFixture.filter((p) => set.has(p.id));
  }
}
