/* PubMedProvider — a real adapter over NCBI E-utilities (esearch + efetch),
 * gated behind USE_LIVE_PUBMED=1. It demonstrates the provider contract is real,
 * not theoretical: it maps `ResearchQuery` to PubMed query syntax and normalizes
 * the XML response to `Paper`. PubMed exposes no citation counts, so those are
 * left for the enrichment step. */

import type { Paper, ResearchQuery, StudyDesign } from '../../../api/types.ts';
import type { LiteratureProvider, PageRequest, PageResult, ProviderCapabilities } from './provider.ts';

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

const DESIGN_TO_PUBTYPE: Record<StudyDesign, string | null> = {
  rct: 'Randomized Controlled Trial',
  cohort: 'Cohort Studies',
  review: 'Review',
  'meta-analysis': 'Meta-Analysis',
  observational: 'Observational Study',
  other: null,
};

/** Translate a ResearchQuery into a PubMed `term` string. */
export function buildPubmedTerm(q: ResearchQuery): string {
  const parts: string[] = [];
  const question = q.question.trim();
  if (question) {
    if (q.mode === 'author') parts.push(`${question}[Author]`);
    else if (q.mode === 'title') parts.push(`${question}[Title]`);
    else if (q.mode === 'methods') parts.push(`${question}[Title/Abstract]`);
    else parts.push(question);
  }
  const designs = (q.filters.studyDesigns ?? [])
    .map((d) => DESIGN_TO_PUBTYPE[d])
    .filter((p): p is string => Boolean(p))
    .map((p) => `${p}[Publication Type]`);
  if (designs.length) parts.push(`(${designs.join(' OR ')})`);

  for (const field of q.filters.fields ?? []) parts.push(`${field}[MeSH Terms]`);
  if (q.filters.excludePreprints) parts.push('NOT preprint[Publication Type]');

  return parts.length ? parts.join(' AND ') : 'medicine';
}

interface ESearchResult {
  esearchresult: { count: string; idlist: string[] };
}

function pick(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : undefined;
}

function parseArticles(xml: string): Paper[] {
  const blocks = xml.split(/<PubmedArticle>/).slice(1);
  return blocks.map((block) => {
    const pmid = pick(block, 'PMID') ?? '';
    const title = pick(block, 'ArticleTitle') ?? '(untitled)';
    const year = Number(pick(block, 'Year') ?? pick(block, 'PubDate')?.match(/\d{4}/)?.[0] ?? 0);
    const journal = pick(block, 'Title') ?? pick(block, 'ISOAbbreviation') ?? 'Unknown journal';
    const doiMatch = block.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/i);
    const abstract = pick(block, 'AbstractText');
    return {
      id: `pubmed:${pmid}`,
      externalIds: { pmid, doi: doiMatch?.[1] },
      title,
      abstract,
      authors: [...block.matchAll(/<LastName>([^<]+)<\/LastName>/g)].map((m) => ({ name: m[1] })),
      year: Number.isFinite(year) ? year : 0,
      venue: { name: journal, type: 'journal' as const },
      isOpenAccess: false,
      isPreprint: false,
      fields: [],
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      provider: 'pubmed',
    } satisfies Paper;
  });
}

export class PubMedProvider implements LiteratureProvider {
  readonly id = 'pubmed';
  readonly capabilities: ProviderCapabilities = {
    citations: false,
    quartile: false,
    openAccess: false,
    fullText: false,
    fields: true,
    countries: false,
  };

  private apiKeyParam(): string {
    return process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : '';
  }

  async search(q: ResearchQuery, page: PageRequest): Promise<PageResult> {
    const term = buildPubmedTerm(q);
    const retstart = Number(page.cursor ?? 0);
    const params =
      `db=pubmed&retmode=json&sort=relevance&retstart=${retstart}` +
      `&retmax=${page.limit}&term=${encodeURIComponent(term)}`;
    const datePart =
      q.filters.yearMin || q.filters.yearMax
        ? `&datetype=pdat&mindate=${q.filters.yearMin ?? 1900}&maxdate=${q.filters.yearMax ?? 3000}`
        : '';

    const searchRes = await fetch(`${EUTILS}/esearch.fcgi?${params}${datePart}${this.apiKeyParam()}`);
    if (!searchRes.ok) throw new Error(`PubMed esearch failed: ${searchRes.status}`);
    const search = (await searchRes.json()) as ESearchResult;
    const ids = search.esearchresult?.idlist ?? [];
    const total = Number(search.esearchresult?.count ?? ids.length);

    if (!ids.length) return { items: [], total, nextCursor: undefined };

    const fetchRes = await fetch(
      `${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(',')}${this.apiKeyParam()}`,
    );
    if (!fetchRes.ok) throw new Error(`PubMed efetch failed: ${fetchRes.status}`);
    const items = parseArticles(await fetchRes.text());

    const nextStart = retstart + ids.length;
    return { items, total, nextCursor: nextStart < total ? String(nextStart) : undefined };
  }

  async fetch(ids: string[]): Promise<Paper[]> {
    const pmids = ids.map((id) => id.replace(/^pubmed:/, '')).join(',');
    if (!pmids) return [];
    const res = await fetch(`${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&id=${pmids}${this.apiKeyParam()}`);
    if (!res.ok) throw new Error(`PubMed efetch failed: ${res.status}`);
    return parseArticles(await res.text());
  }
}
