/* =============================================================================
 * Corpus API — contract types (single source of truth)
 * -----------------------------------------------------------------------------
 * Versioned under base path `/api/v1`. These types are shared by the mock
 * server (`/server`) and the browser client (`/js/api.js`). The OpenAPI spec
 * (`/api/openapi.yaml`) is generated to mirror this file; when they disagree,
 * THIS FILE WINS. Keep both in lockstep.
 *
 * Design notes:
 *  - A report is an ordered list of typed `ContentBlock`s, not fixed fields, so
 *    new figure types can ship backend-first without breaking the renderer.
 *  - Citations are a first-class linking layer carrying a `stance`, matching the
 *    report's inline `.rr-cite[data-meter][data-title]` markers.
 *  - One `ResearchQuery` powers both `/papers` and `/reports`; it maps 1:1 to
 *    the filter drawer.
 * ========================================================================== */

export const API_VERSION = 'v1';
export const API_BASE_PATH = '/api/v1';

/* ----------------------------------------------------------------------------
 * Vocabularies
 * ------------------------------------------------------------------------- */

/** Citation stance. `yes|possibly|mixed` mirror the report's `data-meter`
 *  values; `no|na` extend the vocabulary for completeness. */
export type Stance = 'yes' | 'possibly' | 'mixed' | 'no' | 'na';

/** GRADE-style evidence strength used by evidence matrices and claims. */
export type Grade = 'strong' | 'moderate' | 'weak' | 'emerging' | 'mixed';

export type SearchMode = 'phrase' | 'keyword' | 'title' | 'author' | 'methods';

export type YearPreset = 'any' | '2y' | '5y' | '10y';
export type JournalRank = 'any' | 'q1' | 'q1-q2' | 'q1-q3';
export type Quartile = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export type StudyDesign =
  | 'rct'
  | 'cohort'
  | 'review'
  | 'meta-analysis'
  | 'observational'
  | 'other';

/* ----------------------------------------------------------------------------
 * Research query — drives both /papers and /reports, maps 1:1 to the drawer
 * ------------------------------------------------------------------------- */

export interface QueryFilters {
  yearPreset?: YearPreset;
  yearMin?: number;
  yearMax?: number;
  journalRank?: JournalRank;
  minCitations?: number;
  excludePreprints?: boolean;
  openAccess?: boolean;
  fields?: string[];
  sources?: string[];
  countries?: string[];
  studyDesigns?: StudyDesign[];
  sampleSizeMin?: number;
  followUpMonthsMin?: number;
}

export interface ResearchQuery {
  question: string;
  mode: SearchMode;
  filters: QueryFilters;
}

/* ----------------------------------------------------------------------------
 * Paper — one normalized record across all providers
 * ------------------------------------------------------------------------- */

export interface PaperAuthor {
  name: string;
  affiliation?: string;
  country?: string;
}

export interface PaperVenue {
  name: string;
  type: 'journal' | 'preprint' | 'conference';
  quartile?: Quartile;
  issn?: string;
}

export interface ExternalIds {
  pmid?: string;
  doi?: string;
  openalex?: string;
  semanticScholar?: string;
  biorxiv?: string;
}

export interface Paper {
  id: string;
  externalIds: ExternalIds;
  title: string;
  abstract?: string;
  authors: PaperAuthor[];
  year: number;
  date?: string;
  venue: PaperVenue;
  citationCount?: number;
  isOpenAccess: boolean;
  isPreprint: boolean;
  fields: string[];
  country?: string[];
  studyDesign?: StudyDesign;
  sampleSize?: number;
  followUpMonths?: number;
  url: string;
  pdfUrl?: string;
  provider: string;
}

/* ----------------------------------------------------------------------------
 * References & citations — the linking layer
 * ------------------------------------------------------------------------- */

export interface Reference {
  id: string;
  number: number;
  type: 'journal-article' | 'preprint' | 'review' | 'meta-analysis';
  authors: string[];
  year: number;
  title: string;
  venue: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  openAccess?: boolean;
  citationCount?: number;
}

/** Inline citation marker inside a `prose` block. References a `Reference` by
 *  id/number and carries the stance the report renders as a colored marker. */
export interface CitationRef {
  refId: string;
  number: number;
  stance: Stance;
  tooltip?: string;
}

/* ----------------------------------------------------------------------------
 * Content blocks — the report body is an ordered list of these
 * ------------------------------------------------------------------------- */

export interface HeadingBlock {
  type: 'heading';
  level: 2 | 3;
  number?: string;
  text: string;
}

export interface ProseBlock {
  type: 'prose';
  html: string;
  citations: CitationRef[];
}

export interface TldrBlock {
  type: 'tldr';
  label: string;
  html: string;
}

export interface ConsensusMeterBlock {
  type: 'consensusMeter';
  caption?: string;
  question: string;
  n: number;
  buckets: { stance: Stance; count: number; label?: string }[];
}

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
}

export interface FunnelBlock {
  type: 'funnel';
  caption?: string;
  stages: FunnelStage[];
}

export interface KeyPapersBlock {
  type: 'keyPapers';
  caption?: string;
  items: {
    citationCount: number;
    title: string;
    authors: string;
    year: number;
    venue: string;
    summary: string;
    refId?: string;
  }[];
}

export interface EvidenceMatrixBlock {
  type: 'evidenceMatrix';
  caption?: string;
  rows: { direction: string; outcomes: string; grade: Grade; paperCount: number }[];
}

export interface TimelineBlock {
  type: 'timeline';
  caption?: string;
  axis: { from: number; to: number };
  points: { year: number; citationCount: number; paperId?: string }[];
}

export interface ClaimsBlock {
  type: 'claims';
  caption?: string;
  rows: { claim: string; strength: Grade; reasoning: string; refIds: string[] }[];
}

export interface GapHeatmapBlock {
  type: 'gapHeatmap';
  caption?: string;
  dimensions: string[];
  rows: { topic: string; cells: { dimension: string; level: 'high' | 'med' | 'low' }[] }[];
}

export interface OpenQuestionsBlock {
  type: 'openQuestions';
  items: { question: string; answer: string }[];
}

/** Forward-compatible escape hatch: the renderer switches on `type` and ignores
 *  unknown types, so new block kinds ship backend-first. */
export interface UnknownBlock {
  type: string;
  [k: string]: unknown;
}

export type ContentBlock =
  | HeadingBlock
  | ProseBlock
  | TldrBlock
  | ConsensusMeterBlock
  | FunnelBlock
  | KeyPapersBlock
  | EvidenceMatrixBlock
  | TimelineBlock
  | ClaimsBlock
  | GapHeatmapBlock
  | OpenQuestionsBlock
  | UnknownBlock;

/* ----------------------------------------------------------------------------
 * Synthesis report
 * ------------------------------------------------------------------------- */

export type ReportStatus = 'queued' | 'running' | 'complete' | 'error';
export type ReportCadence = 'weekly' | 'manual';

export interface SynthesisReport {
  id: string;
  query: ResearchQuery;
  status: ReportStatus;
  version: number;
  generatedAt: string;
  updatedAt: string;
  cadence?: ReportCadence;
  topic: string;
  readingTimeMin: number;
  consensus: { label: string; strength: Grade };
  metrics: { contributingStudies: number; corpusSize: number };
  funnel: { stages: FunnelStage[] };
  blocks: ContentBlock[];
  references: Reference[];
}

/* ----------------------------------------------------------------------------
 * Report generation — async job + SSE
 * ------------------------------------------------------------------------- */

export type ReportPhase =
  | 'retrieving'
  | 'screening'
  | 'extracting'
  | 'grading'
  | 'synthesizing'
  | 'complete';

export interface CreateReportRequest {
  query: ResearchQuery;
  idempotencyKey?: string;
}

export interface CreateReportResponse {
  reportId: string;
  jobId: string;
  status: 'queued';
  statusUrl: string;
  eventsUrl: string;
}

/** Server-Sent Events emitted by `GET /reports/{id}/events`. The `event:` field
 *  is the union tag; `data:` is the JSON payload below. */
export type ReportEvent =
  | { event: 'status'; data: { phase: ReportPhase; progress: number; message: string } }
  | { event: 'funnel'; data: { stages: FunnelStage[] } }
  | { event: 'meter'; data: { question: string; n: number; buckets: { stance: Stance; count: number }[] } }
  | { event: 'block'; data: { block: ContentBlock } }
  | { event: 'references'; data: { added: Reference[] } }
  | { event: 'done'; data: { report: SynthesisReport } }
  | { event: 'error'; data: ApiError };

/* ----------------------------------------------------------------------------
 * Facets — drives the filter drawer
 * ------------------------------------------------------------------------- */

export interface FacetItem {
  id: string;
  label: string;
  count?: number;
}

export interface Facets {
  fieldsOfStudy: FacetItem[];
  countries: FacetItem[];
  journalRanks: FacetItem[];
  sources: FacetItem[];
  studyDesigns: FacetItem[];
  yearPresets: FacetItem[];
  searchModes: FacetItem[];
}

/* ----------------------------------------------------------------------------
 * Saved searches / history
 * ------------------------------------------------------------------------- */

export interface SavedSearch {
  id: string;
  name: string;
  query: ResearchQuery;
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  query: ResearchQuery;
  reportId?: string;
  ranAt: string;
}

/* ----------------------------------------------------------------------------
 * Library / collections
 * ------------------------------------------------------------------------- */

export interface CollectionItemRef {
  kind: 'paper' | 'report';
  id: string;
}

export interface CollectionItem {
  id: string;
  ref: CollectionItemRef;
  notes?: string;
  addedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  system?: boolean;
  createdAt: string;
  updatedAt: string;
  items: CollectionItem[];
}

/* ----------------------------------------------------------------------------
 * Auth / user
 * ------------------------------------------------------------------------- */

export interface User {
  id: string;
  name: string;
  initials: string;
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

/* ----------------------------------------------------------------------------
 * Cross-cutting envelopes
 * ------------------------------------------------------------------------- */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/** Error response body. Every non-2xx response uses this shape. */
export interface ApiErrorResponse {
  error: ApiError;
}

/** Cursor-paginated list response. */
export interface Page<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}
