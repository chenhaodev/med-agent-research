import { describe, it, expect } from 'vitest';
import { SjrEnricher } from '../src/providers/enrichers/sjr.ts';
import type { Paper } from '../../api/types.ts';

function paper(over: Partial<Paper> & { venue: Paper['venue'] }): Paper {
  return {
    id: 'x',
    externalIds: {},
    title: 't',
    authors: [],
    year: 2020,
    isOpenAccess: false,
    isPreprint: false,
    fields: [],
    url: 'u',
    provider: 'test',
    ...over,
  };
}

describe('SjrEnricher', () => {
  it('fills venue.quartile from the ISSN table (hyphen-insensitive)', async () => {
    const e = new SjrEnricher({ '1438-8871': 'Q1' });
    const [hyphen] = await e.enrich([paper({ venue: { name: 'JMIR', type: 'journal', issn: '1438-8871' } })]);
    const [plain] = await e.enrich([paper({ venue: { name: 'JMIR', type: 'journal', issn: '14388871' } })]);
    expect(hyphen.venue.quartile).toBe('Q1');
    expect(plain.venue.quartile).toBe('Q1');
  });

  it('leaves papers without an ISSN, or with an unknown ISSN, unchanged', async () => {
    const e = new SjrEnricher({ '1438-8871': 'Q1' });
    const [noIssn] = await e.enrich([paper({ venue: { name: 'X', type: 'journal' } })]);
    const [unknown] = await e.enrich([paper({ venue: { name: 'Y', type: 'journal', issn: '0000-0000' } })]);
    expect(noIssn.venue.quartile).toBeUndefined();
    expect(unknown.venue.quartile).toBeUndefined();
  });

  it('does not overwrite an existing quartile', async () => {
    const e = new SjrEnricher({ '1438-8871': 'Q1' });
    const [p] = await e.enrich([paper({ venue: { name: 'JMIR', type: 'journal', issn: '1438-8871', quartile: 'Q2' } })]);
    expect(p.venue.quartile).toBe('Q2');
  });

  it('is immutable — returns a new paper, never mutates the input', async () => {
    const e = new SjrEnricher({ '1438-8871': 'Q1' });
    const input = paper({ venue: { name: 'JMIR', type: 'journal', issn: '1438-8871' } });
    const [out] = await e.enrich([input]);
    expect(input.venue.quartile).toBeUndefined();
    expect(out).not.toBe(input);
  });

  it('ignores invalid quartile values in the table', async () => {
    const e = new SjrEnricher({ '1111-1111': 'Q9' });
    const [p] = await e.enrich([paper({ venue: { name: 'Z', type: 'journal', issn: '1111-1111' } })]);
    expect(p.venue.quartile).toBeUndefined();
  });
});
