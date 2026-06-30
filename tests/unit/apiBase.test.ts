/* Unit tests for the single, overridable API base (js/config.js + js/api.js).
   Automates Phase-0 verification item 5: the pages follow window.CORPUS_API_BASE. */
import { afterEach, describe, expect, it } from 'vitest';
import '../../js/api.js';

declare global {
  // eslint-disable-next-line no-var
  var CorpusApi: any;
  // eslint-disable-next-line no-var
  var CORPUS_API_BASE: string | undefined;
}

afterEach(() => {
  delete (globalThis as any).CORPUS_API_BASE;
});

describe('CorpusApi base URL resolution', () => {
  it('falls back to the local mock when nothing is configured', () => {
    const api = new globalThis.CorpusApi();
    expect(api.baseUrl).toBe('http://localhost:8787/api/v1');
  });

  it('follows window.CORPUS_API_BASE when set', () => {
    (globalThis as any).CORPUS_API_BASE = 'https://corpus.example/api/v1';
    const api = new globalThis.CorpusApi();
    expect(api.baseUrl).toBe('https://corpus.example/api/v1');
  });

  it('lets an explicit option override the global', () => {
    (globalThis as any).CORPUS_API_BASE = 'https://corpus.example/api/v1';
    const api = new globalThis.CorpusApi({ baseUrl: 'https://override.example/api/v1' });
    expect(api.baseUrl).toBe('https://override.example/api/v1');
  });

  it('builds a correct paper-search query string from a ResearchQuery', () => {
    const api = new globalThis.CorpusApi();
    let captured = '';
    (globalThis as any).fetch = (url: string) => {
      captured = url;
      return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ items: [] }) });
    };
    api.searchPapers({
      question: 'mobile health',
      mode: 'keyword',
      filters: { yearMin: 2018, journalRank: 'q1', fields: ['medicine', 'psychology'], openAccess: true },
    });
    expect(captured).toContain('/papers?');
    expect(captured).toContain('query=mobile%20health');
    expect(captured).toContain('mode=keyword');
    expect(captured).toContain('yearMin=2018');
    expect(captured).toContain('journalRank=q1');
    expect(captured).toContain('fields=medicine');
    expect(captured).toContain('fields=psychology');
    expect(captured).toContain('openAccess=true');
  });
});
