/* Unit tests for CorpusRender.block — one assertion path per ContentBlock type,
   plus the citation token injector, the reference entry, and the unknown-type
   escape hatch. Mirrors the renderers in js/api.js. */
import { describe, expect, it } from 'vitest';
// Side-effect import: js/api.js is a classic IIFE that attaches CorpusApi /
// CorpusRender to window. Importing it through Vite both runs it and lets V8
// coverage instrument the file.
import '../../js/api.js';

declare global {
  // eslint-disable-next-line no-var
  var CorpusRender: any;
}

describe('CorpusRender.block', () => {
  it('renders a heading (level 2) with its number', () => {
    const html = globalThis.CorpusRender.block({ type: 'heading', level: 2, number: '3', text: 'Results' });
    expect(html).toContain('rr-h2');
    expect(html).toContain('Results');
    expect(html).toContain('3');
  });

  it('renders a level-3 heading', () => {
    const html = globalThis.CorpusRender.block({ type: 'heading', level: 3, text: 'Key papers' });
    expect(html).toContain('rr-h3');
    expect(html).toContain('Key papers');
  });

  it('renders a tldr block', () => {
    const html = globalThis.CorpusRender.block({ type: 'tldr', label: 'TL;DR', html: '<strong>x</strong>' });
    expect(html).toContain('rr-tldr');
    expect(html).toContain('TL;DR');
    expect(html).toContain('<strong>x</strong>');
  });

  it('renders prose with an injected citation marker', () => {
    const html = globalThis.CorpusRender.block({
      type: 'prose',
      html: 'A claim{{cite:1}}.',
      citations: [{ refId: 'r1', number: 1, stance: 'yes', tooltip: 'A source' }],
    });
    expect(html).toContain('rr-body');
    expect(html).toContain('rr-cite');
    expect(html).toContain('data-meter="Yes"');
    expect(html).toContain('data-title="A source"');
    expect(html).not.toContain('{{cite:1}}');
  });

  it('renders a consensus meter with proportional segments and a legend', () => {
    const html = globalThis.CorpusRender.block({
      type: 'consensusMeter',
      question: 'Effective?',
      n: 10,
      buckets: [
        { stance: 'yes', count: 4, label: 'Yes' },
        { stance: 'mixed', count: 6, label: 'Mixed' },
      ],
      caption: 'Figure 1 — Distribution.',
    });
    expect(html).toContain('rr-meter__bar');
    expect(html).toContain('N = 10');
    expect(html).toContain('width:40.0%');
    expect(html).toContain('width:60.0%');
    expect(html).toContain('Figure 1');
  });

  it('renders a funnel with formatted counts', () => {
    const html = globalThis.CorpusRender.block({
      type: 'funnel',
      stages: [
        { stage: 'retrieved', label: 'Retrieved', count: 7_500_000 },
        { stage: 'included', label: 'Included', count: 50 },
      ],
    });
    expect(html).toContain('rr-funnel');
    expect(html).toContain('7.5M');
    expect(html).toContain('Included');
    expect(html).toContain('is-final');
  });

  it('renders key papers as a table', () => {
    const html = globalThis.CorpusRender.block({
      type: 'keyPapers',
      items: [{ citationCount: 7, title: 'A review', authors: 'X et al.', year: 2024, venue: 'J', summary: 'sum' }],
    });
    expect(html).toContain('rr-table');
    expect(html).toContain('A review');
    expect(html).toContain('X et al.');
  });

  it('renders an evidence matrix with grade dots', () => {
    const html = globalThis.CorpusRender.block({
      type: 'evidenceMatrix',
      rows: [{ direction: 'A', outcomes: 'o', grade: 'strong', paperCount: 14 }],
    });
    expect(html).toContain('rr-table--wide');
    expect(html).toContain('is-strong');
    expect(html).toContain('Strong');
  });

  it('renders a timeline as an svg with one circle per point', () => {
    const html = globalThis.CorpusRender.block({
      type: 'timeline',
      axis: { from: 2005, to: 2025 },
      points: [{ year: 2010, citationCount: 9 }, { year: 2020, citationCount: 16 }],
    });
    expect(html).toContain('<svg');
    expect((html.match(/<circle/g) || []).length).toBe(2);
  });

  it('renders claims with strength pills', () => {
    const html = globalThis.CorpusRender.block({
      type: 'claims',
      rows: [{ claim: 'c', strength: 'moderate', reasoning: 'r', refIds: ['r1'] }],
    });
    expect(html).toContain('rr-pill');
    expect(html).toContain('Moderate');
  });

  it('renders a gap heatmap with leveled cells', () => {
    const html = globalThis.CorpusRender.block({
      type: 'gapHeatmap',
      dimensions: ['Long-term', 'Equity'],
      rows: [{ topic: 'A', cells: [{ dimension: 'Long-term', level: 'high' }, { dimension: 'Equity', level: 'low' }] }],
    });
    expect(html).toContain('rr-table--heat');
    expect(html).toContain('is-high');
    expect(html).toContain('HIGH');
  });

  it('renders open questions as accordion items', () => {
    const html = globalThis.CorpusRender.block({
      type: 'openQuestions',
      items: [{ question: 'Q?', answer: 'A.' }],
    });
    expect(html).toContain('rr-acc-btn');
    expect(html).toContain('Q?');
    expect(html).toContain('A.');
  });

  it('returns empty string for an unknown block type (forward-compatible)', () => {
    expect(globalThis.CorpusRender.block({ type: 'forestPlot', data: 1 } as any)).toBe('');
    expect(globalThis.CorpusRender.block(undefined as any)).toBe('');
  });

  it('escapes HTML in user-derived text', () => {
    const html = globalThis.CorpusRender.block({ type: 'heading', level: 2, text: '<script>x</script>' });
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('CorpusRender.reference', () => {
  it('renders a reference entry with authors, year, and venue', () => {
    const html = globalThis.CorpusRender.reference({
      id: 'r1', number: 1, type: 'journal-article',
      authors: ['Smith, A.', 'Doe, B.'], year: 2024, title: 'A study', venue: 'Journal', volume: '12', issue: '3', pages: '1-10',
    });
    expect(html).toContain('rr-ref');
    expect(html).toContain('Smith, A., Doe, B.');
    expect(html).toContain('2024');
    expect(html).toContain('A study');
    expect(html).toContain('Journal');
  });
});

describe('CorpusRender.injectCitations', () => {
  it('drops tokens that have no matching citation', () => {
    const html = globalThis.CorpusRender.injectCitations('a{{cite:9}}b', []);
    expect(html).toBe('ab');
  });
});
