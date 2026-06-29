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
```

Environment:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Listen port |
| `STREAM_STEP_MS` | `220` | Delay between SSE events (lower = faster stream) |
| `USE_LIVE_PUBMED` | unset | `1` routes `/papers` through the real NCBI E-utilities adapter |
| `NCBI_API_KEY` | unset | Optional PubMed API key (higher rate limit) |
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
  providers/          LiteratureProvider contract + Mock / PubMed / Aggregator
  pipeline/           report template (from report.html) + references + stream
fixtures/
  facets.json         23 fields, 236 countries, ranks, sources, designs, modes
  papers.json         12 normalized sample papers
```

## Auth model (mock)

Public: `/health`, `/facets`, `/papers`, `/reports*`, `/auth/login`.
Bearer-required: `/me`, `/auth/logout`, `/saved-searches*`, `/history`, `/collections*`.

`/reports` is left open in the mock for ergonomic `curl` testing; in production
it would be user-scoped like the rest. Get a token with `POST /auth/login`
(any email/password) and send `Authorization: Bearer <token>`.

## Providers

`Aggregator` fans out across the active providers, dedups by DOI, enriches, and
applies shared post-filters. With `USE_LIVE_PUBMED=1` it uses `PubMedProvider`
(real esearch/efetch); otherwise `MockProvider` serves the fixtures. Adding a
source = implement `LiteratureProvider` and register it in `aggregator.ts`.
