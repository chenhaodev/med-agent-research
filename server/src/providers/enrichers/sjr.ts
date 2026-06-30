/* SjrEnricher — fills in `venue.quartile` by ISSN from the SCImago Journal Rank
 * table. Sources like OpenAlex and Semantic Scholar carry an ISSN but no
 * quartile; this lets the journalRank filter work across all providers.
 *
 * The lookup tolerates ISSNs with or without the hyphen. Immutable: returns a
 * new Paper only when it adds a quartile, otherwise the original reference. */

import type { Paper, Quartile } from '../../../../api/types.ts';
import type { PaperEnricher } from '../provider.ts';
import { sjrFixture } from '../../fixtures.ts';

const VALID = new Set<Quartile>(['Q1', 'Q2', 'Q3', 'Q4']);

function normIssn(issn: string): string {
  return issn.replace(/[^0-9xX]/g, '').toUpperCase();
}

/** Build a quartile lookup keyed by normalized (hyphen-stripped) ISSN. */
function buildIndex(table: Record<string, string>): Map<string, Quartile> {
  const index = new Map<string, Quartile>();
  for (const [issn, q] of Object.entries(table)) {
    if (VALID.has(q as Quartile)) index.set(normIssn(issn), q as Quartile);
  }
  return index;
}

export class SjrEnricher implements PaperEnricher {
  readonly id = 'sjr';
  private readonly index: Map<string, Quartile>;

  constructor(table: Record<string, string> = sjrFixture) {
    this.index = buildIndex(table);
  }

  async enrich(papers: Paper[]): Promise<Paper[]> {
    return papers.map((p) => {
      if (p.venue.quartile || !p.venue.issn) return p;
      const quartile = this.index.get(normIssn(p.venue.issn));
      if (!quartile) return p;
      return { ...p, venue: { ...p.venue, quartile } };
    });
  }
}
