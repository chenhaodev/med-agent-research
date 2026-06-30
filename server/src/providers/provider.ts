/* The provider contract. Each literature source implements `LiteratureProvider`
 * by normalizing its native schema to the shared `Paper`. The aggregator fans
 * out across providers, dedups, enriches, and applies post-filters — so adding
 * a source is a backend-only change with zero frontend churn. */

import type { Paper, ResearchQuery } from '../../../api/types.ts';

export interface ProviderCapabilities {
  citations: boolean;
  quartile: boolean;
  openAccess: boolean;
  fullText: boolean;
  fields: boolean;
  countries: boolean;
}

export interface PageRequest {
  cursor?: string;
  limit: number;
}

export interface PageResult {
  items: Paper[];
  total?: number;
  nextCursor?: string;
}

export interface LiteratureProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  search(q: ResearchQuery, page: PageRequest): Promise<PageResult>;
  fetch(ids: string[]): Promise<Paper[]>;
}

/* An enricher augments already-normalized papers with metadata no single search
 * provider carries (e.g. SJR journal quartile by ISSN). The aggregator runs the
 * active enrichers over the merged set before post-filtering, so a filter like
 * journalRank can act on enriched values. Enrichers must be immutable: return a
 * new Paper, never mutate the input. */
export interface PaperEnricher {
  readonly id: string;
  enrich(papers: Paper[]): Promise<Paper[]>;
}

/* ---- Shared post-filtering applied by the aggregator after fan-out ---- */

const QUARTILE_RANK: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };

function withinJournalRank(paper: Paper, rank: ResearchQuery['filters']['journalRank']): boolean {
  if (!rank || rank === 'any') return true;
  const max = rank === 'q1' ? 1 : rank === 'q1-q2' ? 2 : 3;
  const q = paper.venue.quartile;
  if (!q) return false;
  return QUARTILE_RANK[q] <= max;
}

/** Apply the filters that are cheaper to enforce post-normalization than to
 *  push down into every provider's native query syntax. */
export function applyPostFilters(papers: Paper[], q: ResearchQuery): Paper[] {
  const f = q.filters;
  return papers.filter((p) => {
    if (f.excludePreprints && p.isPreprint) return false;
    if (f.openAccess && !p.isOpenAccess) return false;
    if (typeof f.minCitations === 'number' && (p.citationCount ?? 0) < f.minCitations) return false;
    if (!withinJournalRank(p, f.journalRank)) return false;
    if (typeof f.yearMin === 'number' && p.year < f.yearMin) return false;
    if (typeof f.yearMax === 'number' && p.year > f.yearMax) return false;
    if (typeof f.sampleSizeMin === 'number' && (p.sampleSize ?? 0) < f.sampleSizeMin) return false;
    if (typeof f.followUpMonthsMin === 'number' && (p.followUpMonths ?? 0) < f.followUpMonthsMin) return false;
    if (f.fields?.length && !f.fields.some((field) => p.fields.includes(field))) return false;
    if (f.sources?.length && !f.sources.includes(p.provider)) return false;
    if (f.studyDesigns?.length && (!p.studyDesign || !f.studyDesigns.includes(p.studyDesign))) return false;
    if (f.countries?.length && !(p.country ?? []).some((c) => f.countries!.includes(c))) return false;
    return true;
  });
}

/** Dedup by DOI (then by id), keeping the record with the most metadata. */
export function dedupeByDoi(papers: Paper[]): Paper[] {
  const byKey = new Map<string, Paper>();
  for (const p of papers) {
    const key = p.externalIds.doi ?? p.id;
    const existing = byKey.get(key);
    if (!existing || (p.citationCount ?? 0) > (existing.citationCount ?? 0)) {
      byKey.set(key, p);
    }
  }
  return [...byKey.values()];
}
