/* SemanticScholarProvider — adapter over the Semantic Scholar Graph API
 * (/graph/v1/paper/search). Strong on citation counts and fields of study;
 * offset-based pagination surfaced as the provider's native cursor. An optional
 * S2_API_KEY raises the unauthenticated rate limit. */

import type { Paper, ResearchQuery, StudyDesign } from '../../../api/types.ts';
import type { LiteratureProvider, PageRequest, PageResult, ProviderCapabilities } from './provider.ts';
import { getJson } from './http.ts';

const BASE = 'https://api.semanticscholar.org/graph/v1/paper';
const FIELDS =
  'title,abstract,year,citationCount,externalIds,authors,venue,journal,publicationTypes,openAccessPdf,fieldsOfStudy';

interface S2Paper {
  paperId: string;
  externalIds?: { DOI?: string; PubMed?: string; ArXiv?: string | null; CorpusId?: number };
  title?: string;
  abstract?: string | null;
  year?: number | null;
  citationCount?: number;
  venue?: string;
  journal?: { name?: string; volume?: string; pages?: string } | null;
  publicationTypes?: string[] | null;
  openAccessPdf?: { url?: string; status?: string } | null;
  fieldsOfStudy?: string[] | null;
  authors?: Array<{ authorId?: string; name?: string }>;
}

interface S2SearchResponse {
  total?: number;
  offset?: number;
  next?: number;
  data?: S2Paper[];
}

const PREPRINT_VENUE = /arxiv|biorxiv|medrxiv|ssrn|preprint|research\s*square/i;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function studyDesign(types?: string[] | null): StudyDesign | undefined {
  const set = new Set((types ?? []).map((t) => t.toLowerCase()));
  if (set.has('metaanalysis') || set.has('meta-analysis')) return 'meta-analysis';
  if (set.has('review')) return 'review';
  if (set.has('clinicaltrial')) return 'rct';
  return undefined;
}

function isPreprint(p: S2Paper): boolean {
  if (p.externalIds?.ArXiv) return true;
  const venue = p.venue ?? p.journal?.name ?? '';
  return PREPRINT_VENUE.test(venue);
}

export function normalizeS2(p: S2Paper): Paper {
  const venueName = p.journal?.name ?? p.venue ?? 'Unknown venue';
  const preprint = isPreprint(p);
  return {
    id: `s2:${p.paperId}`,
    externalIds: {
      semanticScholar: p.paperId,
      doi: p.externalIds?.DOI,
      pmid: p.externalIds?.PubMed,
    },
    title: p.title ?? '(untitled)',
    abstract: p.abstract ?? undefined,
    authors: (p.authors ?? []).map((a) => ({ name: a.name ?? '(anonymous)' })),
    year: p.year ?? 0,
    venue: { name: venueName, type: preprint ? 'preprint' : 'journal' },
    citationCount: p.citationCount ?? 0,
    isOpenAccess: Boolean(p.openAccessPdf?.url),
    isPreprint: preprint,
    fields: (p.fieldsOfStudy ?? []).map(slugify),
    studyDesign: studyDesign(p.publicationTypes),
    url: `https://www.semanticscholar.org/paper/${p.paperId}`,
    pdfUrl: p.openAccessPdf?.url ?? undefined,
    provider: 'semantic-scholar',
  } satisfies Paper;
}

function headers(): RequestInit | undefined {
  const key = process.env.S2_API_KEY;
  return key ? { headers: { 'x-api-key': key } } : undefined;
}

export class SemanticScholarProvider implements LiteratureProvider {
  readonly id = 'semantic-scholar';
  readonly capabilities: ProviderCapabilities = {
    citations: true,
    quartile: false,
    openAccess: true,
    fullText: false,
    fields: true,
    countries: false,
  };

  async search(q: ResearchQuery, page: PageRequest): Promise<PageResult> {
    const query = q.question.trim();
    if (!query) return { items: [], total: 0, nextCursor: undefined };

    const offset = Number(page.cursor ?? 0) || 0;
    const params = new URLSearchParams({
      query,
      offset: String(offset),
      limit: String(Math.min(page.limit, 100)),
      fields: FIELDS,
    });
    const data = await getJson<S2SearchResponse>(`${BASE}/search?${params.toString()}`, headers());
    const items = (data.data ?? []).map(normalizeS2);
    return {
      items,
      total: data.total,
      nextCursor: typeof data.next === 'number' ? String(data.next) : undefined,
    };
  }

  async fetch(ids: string[]): Promise<Paper[]> {
    const s2Ids = ids.filter((id) => id.startsWith('s2:')).map((id) => id.replace(/^s2:/, ''));
    if (!s2Ids.length) return [];
    const results = await Promise.all(
      s2Ids.map((id) =>
        getJson<S2Paper>(`${BASE}/${encodeURIComponent(id)}?fields=${FIELDS}`, headers())
          .then(normalizeS2)
          .catch(() => null),
      ),
    );
    return results.filter((p): p is Paper => p !== null);
  }
}
