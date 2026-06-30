# Corpus mock server

A runnable, fixture-backed implementation of the Corpus API (`/api/v1`). No
database — in-memory stores seeded at startup. Lets the static frontend call a
real backend with zero contract churn, and lets real literature providers be
swapped in behind the same interface.

## Run

```bash
cd server
npm install
npm run mock          # http://localhost:8787/api/v1   (default port 8787)
npm run dev           # same, with watch-reload
npm run typecheck     # tsc --noEmit
npm test              # vitest — provider/enricher unit tests (network-free)
```

Environment:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Listen port |
| `STREAM_STEP_MS` | `220` | Delay between SSE events (lower = faster stream) |
| `CORPUS_PROVIDERS` | unset | Active search providers, e.g. `openalex,semantic-scholar,biorxiv` |
| `CORPUS_ENRICHERS` | unset | Active enrichers, e.g. `sjr` |
| `USE_LIVE_PUBMED` | unset | `1` routes `/papers` through the real NCBI E-utilities adapter (when `CORPUS_PROVIDERS` is empty) |
| `NCBI_API_KEY` | unset | Optional PubMed API key (higher rate limit) |
| `OPENALEX_MAILTO` | `corpus@example.com` | Contact for the OpenAlex polite pool |
| `S2_API_KEY` | unset | Optional Semantic Scholar API key (higher rate limit) |
| `MOCK_TOKEN` | `mock-token-corpus` | The static bearer token the mock issues/accepts |

## Layout

```
src/
  index.ts            Fastify app + route registration + error envelope
  config.ts           env-sourced config
  store.ts            in-memory stores (reports, jobs, saved, history, collections)
  jobs.ts             report-generation runner (timed SSE sequence + event buffer)
  sse.ts              Server-Sent Events writer
  auth.ts             bearer-token guard
  errors.ts           ApiException + JSON error envelope
  fixtures.ts         loads fixtures/*.json
  routes/             one module per resource
  providers/          LiteratureProvider contract, Aggregator, registry, cursor
    mock.ts pubmed.ts openalex.ts semanticScholar.ts biorxiv.ts
    enrichers/sjr.ts  PaperEnricher: SJR journal quartile by ISSN
  pipeline/           report template (from report.html) + references + stream
fixtures/
  facets.json         23 fields, 236 countries, ranks, sources, designs, modes
  papers.json         12 normalized sample papers
  sjr.json            ISSN -> SJR quartile sample (full Scimago CSV drops in here)
  http/               recorded API responses used by the provider tests
tests/                vitest provider/enricher/aggregator tests (network-free)
```

## Auth model (mock)

Public: `/health`, `/facets`, `/papers`, `/reports*`, `/auth/login`.
Bearer-required: `/me`, `/auth/logout`, `/saved-searches*`, `/history`, `/collections*`.

`/reports` is left open in the mock for ergonomic `curl` testing; in production
it would be user-scoped like the rest. Get a token with `POST /auth/login`
(any email/password) and send `Authorization: Bearer <token>`.

## Providers

`Aggregator` fans out across the active providers in parallel, dedups by DOI,
runs enrichers, and applies shared post-filters. A failing provider is isolated
(`Promise.allSettled`) so one bad source can't sink a search.

| Provider | id | Strengths |
|---|---|---|
| OpenAlex | `openalex` | citations, open-access, topics→fields, author country, ISSN |
| Semantic Scholar | `semantic-scholar` | citations, fields, publication-type→study design |
| bioRxiv / medRxiv | `biorxiv` / `medrxiv` | preprints (date-window + local keyword filter) |
| PubMed | `pubmed` | MeSH-aware term building (real esearch/efetch) |
| Mock | `mock` | bundled fixtures (default, offline) |

Enrichers augment the merged set: `sjr` fills `venue.quartile` by ISSN (so the
`journalRank` filter works across providers that don't carry a quartile).

**Selecting sources** — `CORPUS_PROVIDERS=openalex,semantic-scholar,biorxiv`
and `CORPUS_ENRICHERS=sjr`. With no `CORPUS_PROVIDERS`, it falls back to live
PubMed (if `USE_LIVE_PUBMED=1`) or the mock fixtures.

**Pagination** — each provider keeps its own native cursor (OpenAlex token,
S2/PubMed offset, bioRxiv window offset); the aggregator bundles them into one
opaque **composite cursor** the client round-trips. Exhausted providers drop out;
an empty bundle means no next page.

Adding a source = implement `LiteratureProvider` (or `PaperEnricher`) and add one
line to `providers/registry.ts`. Provider tests run against recorded HTTP
fixtures (`fixtures/http/`), so CI never touches the live network.
