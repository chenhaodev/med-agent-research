/* Unit tests for paper-search.js readQuery() — the pure DOM read that turns the
   filter drawer + searchbox into a ResearchQuery. Exercised against a fixture
   that mirrors the index.html drawer markup. */
import { beforeEach, describe, expect, it } from 'vitest';
// Side-effect import: js/paper-search.js attaches window.PaperSearch (and runs
// its one-time init against whatever DOM exists, which is harmless here).
// Imported through Vite so V8 coverage instruments it. readQuery() is a pure
// DOM read, so the per-test fixture below is all it needs.
import '../../js/paper-search.js';

declare global {
  // eslint-disable-next-line no-var
  var PaperSearch: any;
}

/* A trimmed copy of the index.html drawer that carries every attribute
   readQuery() depends on. Facet tags are pre-rendered (as loadFacets would). */
const DRAWER = `
  <div id="ps-root">
    <input id="ps-input" type="search">
    <button class="ps-chip" type="button" data-mode="methods">Methods</button>
    <button class="ps-chip" type="button" data-mode="keyword">Keyword</button>
    <button class="ps-chip" type="button" data-mode="author">Author</button>
    <div class="ps-seg">
      <button class="ps-seg-btn is-on" data-preset="any">Any</button>
      <button class="ps-seg-btn" data-preset="2y">Past 2 yrs.</button>
      <button class="ps-seg-btn" data-preset="5y">Past 5 yrs.</button>
      <button class="ps-seg-btn" data-preset="10y">Past 10 yrs.</button>
    </div>
    <input class="ps-input" data-field="yearMin">
    <input class="ps-input" data-field="yearMax" value="2026">
    <select class="ps-select" data-field="journalRank">
      <option value="any">Any</option><option value="q1">Q1 only</option>
      <option value="q1-q2">Q1-Q2</option><option value="q1-q3">Q1-Q3</option>
    </select>
    <input class="ps-citation-row__input" data-field="minCitations" value="0">
    <button class="ps-toggle" data-field="excludePreprints"><span></span></button>
    <button class="ps-toggle" data-field="openAccess"><span></span></button>
    <div class="ps-fos" data-facet="fieldsOfStudy">
      <button class="ps-tag" data-id="medicine">Medicine</button>
      <button class="ps-tag" data-id="psychology">Psychology</button>
    </div>
    <div class="ps-fos" data-facet="sources">
      <button class="ps-tag" data-id="pubmed">PubMed</button>
    </div>
    <div class="ps-fos" data-facet="countries">
      <button class="ps-tag" data-id="us">United States</button>
    </div>
    <div class="ps-fos" data-facet="studyDesigns">
      <button class="ps-tag" data-id="rct">RCT</button>
    </div>
  </div>`;

beforeEach(() => {
  document.body.innerHTML = DRAWER;
});

function readQuery() {
  return globalThis.PaperSearch.readQuery(document);
}

describe('readQuery — defaults', () => {
  it('reads an empty question, default keyword mode, and minimal filters', () => {
    const q = readQuery();
    expect(q.question).toBe('');
    expect(q.mode).toBe('keyword');
    // Only the default max year survives; presets/ranks at "any" are omitted.
    expect(q.filters).toEqual({ yearMax: 2026 });
  });
});

describe('readQuery — question + mode', () => {
  it('reads the typed question (trimmed)', () => {
    (document.getElementById('ps-input') as HTMLInputElement).value = '  mobile health  ';
    expect(readQuery().question).toBe('mobile health');
  });

  it('reads the active mode chip', () => {
    document.querySelector('.ps-chip[data-mode="author"]')!.classList.add('is-active');
    expect(readQuery().mode).toBe('author');
  });
});

describe('readQuery — general filters', () => {
  it('reads a year preset when not "any"', () => {
    document.querySelector('.ps-seg-btn.is-on')!.classList.remove('is-on');
    document.querySelector('.ps-seg-btn[data-preset="5y"]')!.classList.add('is-on');
    expect(readQuery().filters.yearPreset).toBe('5y');
  });

  it('reads min/max year as numbers', () => {
    (document.querySelector('[data-field="yearMin"]') as HTMLInputElement).value = '2018';
    (document.querySelector('[data-field="yearMax"]') as HTMLInputElement).value = '2025';
    const f = readQuery().filters;
    expect(f.yearMin).toBe(2018);
    expect(f.yearMax).toBe(2025);
  });

  it('reads journal rank when not "any"', () => {
    (document.querySelector('[data-field="journalRank"]') as HTMLSelectElement).value = 'q1-q2';
    expect(readQuery().filters.journalRank).toBe('q1-q2');
  });

  it('omits minCitations when 0 but includes a positive value', () => {
    expect(readQuery().filters.minCitations).toBeUndefined();
    (document.querySelector('[data-field="minCitations"]') as HTMLInputElement).value = '50';
    expect(readQuery().filters.minCitations).toBe(50);
  });

  it('reads the two boolean toggles only when on', () => {
    expect(readQuery().filters.excludePreprints).toBeUndefined();
    document.querySelector('.ps-toggle[data-field="excludePreprints"]')!.classList.add('is-on');
    document.querySelector('.ps-toggle[data-field="openAccess"]')!.classList.add('is-on');
    const f = readQuery().filters;
    expect(f.excludePreprints).toBe(true);
    expect(f.openAccess).toBe(true);
  });
});

describe('readQuery — facet selections', () => {
  it('collects selected facet ids by catalog', () => {
    document.querySelector('.ps-fos[data-facet="fieldsOfStudy"] .ps-tag[data-id="medicine"]')!.classList.add('is-on');
    document.querySelector('.ps-fos[data-facet="sources"] .ps-tag[data-id="pubmed"]')!.classList.add('is-on');
    document.querySelector('.ps-fos[data-facet="countries"] .ps-tag[data-id="us"]')!.classList.add('is-on');
    document.querySelector('.ps-fos[data-facet="studyDesigns"] .ps-tag[data-id="rct"]')!.classList.add('is-on');
    const f = readQuery().filters;
    expect(f.fields).toEqual(['medicine']);
    expect(f.sources).toEqual(['pubmed']);
    expect(f.countries).toEqual(['us']);
    expect(f.studyDesigns).toEqual(['rct']);
  });

  it('omits facet keys when nothing is selected', () => {
    const f = readQuery().filters;
    expect(f.fields).toBeUndefined();
    expect(f.sources).toBeUndefined();
  });
});
