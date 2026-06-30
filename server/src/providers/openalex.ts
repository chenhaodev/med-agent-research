/* OpenAlexProvider — adapter over the OpenAlex /works API.
 *
 * OpenAlex is the richest single source here: citation counts, open-access
 * status, topics (→ fields of study), and author institution countries. It uses
 * cursor pagination (`cursor=*` then `meta.next_cursor`), which the provider
 * surfaces as its native cursor for the composite scheme. Abstracts arrive as an
 * inverted index, reconstructed to plain text below. */

import type { Paper, ResearchQuery, StudyDesign } from '../../../api/types.ts';
import type { LiteratureProvider, PageRequest, PageResult, ProviderCapabilities } from './provider.ts';
import { getJson } from './http.ts';

const BASE = 'https://api.openalex.org/works';
/* OpenAlex asks for a contact in the `mailto` param to join the polite pool. */
const MAILTO = process.env.OPENALEX_MAILTO ?? 'corpus@example.com';

interface OAWork {
  id: string;
  doi?: string | null;
  display_name?: string;
  title?: string;
  publication_year?: number;
  publication_date?: string;
  ids?: { openalex?: string; doi?: string; pmid?: string };
  primary_location?: {
    landing_page_url?: string;
    pdf_url?: string | null;
    source?: { display_name?: string; issn_l?: string | null; type?: string } | null;
  } | null;
  open_access?: { is_oa?: boolean; oa_url?: string | null };
  type?: string;
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: Array<{
    author?: { display_name?: string };
    countries?: string[];
    institutions?: Array<{ display_name?: string; country_code?: string }>;
  }>;
  topics?: Array<{ display_name?: string; field?: { display_name?: string } }>;
}

interface OAResponse {
  meta?: { count?: number; next_cursor?: string | null };
  results?: OAWork[];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function tail(idUrl?: string): string {
  if (!idUrl) return '';
  const parts = idUrl.split('/');
  return parts[parts.length - 1] ?? '';
}

function stripDoi(doi?: string | null): string | undefined {
  if (!doi) return undefined;
  return doi.replace(/^https?:\/\/doi\.org\//i, '');
}

/** Reconstruct OpenAlex's `abstract_inverted_index` ({ token: [positions] }) into
 *  plain text. Returns undefined when no abstract is present. */
export function invertedIndexToText(index?: Record<string, number[]> | null): string | undefined {
  if (!index) return undefined;
  const slots: string[] = [];
  for (const [token, positions] of Object.entries(index)) {
    for (const pos of positions) slots[pos] = token;
  }
  const text = slots.filter((t) => t !== undefined).join(' ').trim();
  return text || undefined;
}

const PREPRINT_SOURCE_TYPES = new Set(['repository']);

function isPreprint(work: OAWork): boolean {
  if (work.type === 'preprint') return true;
  const st = work.primary_location?.source?.type;
  return st ? PREPRINT_SOURCE_TYPES.has(st) : false;
}

function venueType(work: OAWork): Paper['venue']['type'] {
  if (isPreprint(work)) return 'preprint';
  if (work.primary_location?.source?.type === 'conference') return 'conference';
  return 'journal';
}

function studyDesign(work: OAWork): StudyDesign | undefined {
  const t = (work.type ?? '').toLowerCase();
  if (t.includes('review')) return 'review';
  return undefined;
}

function countries(work: OAWork): string[] {
  const set = new Set<string>();
  for (const a of work.authorships ?? []) {
    for (const c of a.countries ?? []) if (c) set.add(c.toLowerCase());
    for (const inst of a.institutions ?? []) if (inst.country_code) set.add(inst.country_code.toLowerCase());
  }
  return [...set];
}

function fields(work: OAWork): string[] {
  const set = new Set<string>();
  for (const t of work.topics ?? []) {
    if (t.field?.display_name) set.add(slugify(t.field.display_name));
  }
  return [...set];
}

export function normalizeWork(work: OAWork): Paper {
  const openalexId = tail(work.ids?.openalex ?? work.id);
  return {
    id: `openalex:${openalexId}`,
    externalIds: {
      openalex: openalexId,
      doi: stripDoi(work.ids?.doi ?? work.doi),
      pmid: work.ids?.pmid ? tail(work.ids.pmid) : undefined,
    },
    title: work.display_name ?? work.title ?? '(untitled)',
    abstract: invertedIndexToText(work.abstract_inverted_index),
    authors: (work.authorships ?? []).map((a) => ({
      name: a.author?.display_name ?? '(anonymous)',
      affiliation: a.institutions?.[0]?.display_name,
      country: (a.countries?.[0] ?? a.institutions?.[0]?.country_code)?.toLowerCase(),
    })),
    year: work.publication_year ?? 0,
    date: work.publication_date,
    venue: {
      name: work.primary_location?.source?.display_name ?? 'Unknown venue',
      type: venueType(work),
      issn: work.primary_location?.source?.issn_l ?? undefined,
    },
    citationCount: work.cited_by_count ?? 0,
    isOpenAccess: Boolean(work.open_access?.is_oa),
    isPreprint: isPreprint(work),
    fields: fields(work),
    country: countries(work),
    studyDesign: studyDesign(work),
    url: work.primary_location?.landing_page_url ?? work.ids?.openalex ?? work.id,
    pdfUrl: work.open_access?.oa_url ?? work.primary_location?.pdf_url ?? undefined,
    provider: 'openalex',
  } satisfies Paper;
}

/** Push the cheap, index-friendly filters down into OpenAlex's `filter=` param. */
function buildFilter(q: ResearchQuery): string | undefined {
  const f = q.filters;
  const parts: string[] = [];
  if (typeof f.yearMin === 'number') parts.push(`from_publication_date:${f.yearMin}-01-01`);
  if (typeof f.yearMax === 'number') parts.push(`to_publication_date:${f.yearMax}-12-31`);
  if (f.openAccess) parts.push('is_oa:true');
  if (typeof f.minCitations === 'number' && f.minCitations > 0) parts.push(`cited_by_count:>${f.minCitations - 1}`);
  if (f.excludePreprints) parts.push('type:!preprint');
  return parts.length ? parts.join(',') : undefined;
}

export class OpenAlexProvider implements LiteratureProvider {
  readonly id = 'openalex';
  readonly capabilities: ProviderCapabilities = {
    citations: true,
    quartile: false,
    openAccess: true,
    fullText: false,
    fields: true,
    countries: true,
  };

  async search(q: ResearchQuery, page: PageRequest): Promise<PageResult> {
    const params = new URLSearchParams();
    if (q.question.trim()) params.set('search', q.question.trim());
    params.set('per-page', String(Math.min(page.limit, 200)));
    params.set('cursor', page.cursor || '*');
    const filter = buildFilter(q);
    if (filter) params.set('filter', filter);
    params.set('mailto', MAILTO);

    const data = await getJson<OAResponse>(`${BASE}?${params.toString()}`);
    const items = (data.results ?? []).map(normalizeWork);
    const next = data.meta?.next_cursor ?? undefined;
    return {
      items,
      total: data.meta?.count,
      nextCursor: next && items.length ? next : undefined,
    };
  }

  async fetch(ids: string[]): Promise<Paper[]> {
    const oaIds = ids
      .filter((id) => id.startsWith('openalex:'))
      .map((id) => id.replace(/^openalex:/, ''));
    if (!oaIds.length) return [];
    const params = new URLSearchParams({
      filter: `openalex_id:${oaIds.map((i) => `https://openalex.org/${i}`).join('|')}`,
      'per-page': String(oaIds.length),
      mailto: MAILTO,
    });
    const data = await getJson<OAResponse>(`${BASE}?${params.toString()}`);
    return (data.results ?? []).map(normalizeWork);
  }
}
