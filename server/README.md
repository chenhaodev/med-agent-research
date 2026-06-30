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
npm test              # vitest — providers, queue, hub, scheduler (network-free)
```

Environment:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Listen port |
| `STREAM_STEP_MS` | `220` | Delay between SSE events (fixture path; lower = faster) |
| `CORPUS_PROVIDERS` | unset | Active search providers, e.g. `openalex,semantic-scholar,biorxiv` |
| `CORPUS_ENRICHERS` | unset | Active enrichers, e.g. `sjr` |
| `USE_LIVE_PUBMED` | unset | `1` routes `/papers` through the real NCBI E-utilities adapter (when `CORPUS_PROVIDERS` is empty) |
| `NCBI_API_KEY` | unset | Optional PubMed API key (higher rate limit) |
| `OPENALEX_MAILTO` | `corpus@example.com` | Contact for the OpenAlex polite pool |
| `S2_API_KEY` | unset | Optional Semantic Scholar API key (higher rate limit) |
| `MOCK_TOKEN` | `mock-token-corpus` | The static bearer token the mock issues/accepts |
| `USE_BRAIN` | unset | `1` generates reports via the Python synthesis worker (see [`../synthesis`](../synthesis/README.md)) |
| `QUEUE_DRIVER` | `memory` | Job queue driver: `memory` (in-process) or `bullmq` (Redis) |
| `QUEUE_CONCURRENCY` | `4` | Concurrent report-generation jobs |
| `QUEUE_MAX_ATTEMPTS` | `3` | Attempts per job before it is marked failed |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection for the `bullmq` driver |
| `ENABLE_SCHEDULER` | unset | `1` runs the weekly recompute scheduler |
| `WEEKLY_CADENCE_MS` | `604800000` | Recompute cadence for `cadence: weekly` reports |
| `DB_DRIVER` | `memory` | Durable store: `memory` (in-process) or `postgres` |
| `DATABASE_URL` | `postgres://localhost:5432/corpus` | Postgres connection for the `postgres` driver |

## Layout

```
src/
  index.ts            Fastify app + route registration + worker/scheduler startup
  config.ts           env-sourced config
  store.ts            repository-backed stores (CachedRepo write-through cache)
  repo/               Repository + KvStore + Memory/Postgres drivers + CachedRepo + migrate
migrations/           SQL schema (JSONB per aggregate)
  jobs.ts             enqueue + worker: run generation (Brain or fixture), publish to hub
  hub.ts              per-report event log (monotonic ids) + Last-Event-ID replay pub/sub
  queue/              JobQueue contract + MemoryQueue (default) + BullMQ/Redis driver + registry
  scheduler.ts        weekly recompute scheduler (cadence: weekly)
  brain.ts            spawns the Python synthesis worker; relays its NDJSON events
  sse.ts              Server-Sent Events writer (emits id: for reconnection)
  auth.ts             bearer-token guard
  errors.ts           ApiException + JSON error envelope
  fixtures.ts         loads fixtures/*.json
  routes/             one module per resource
  providers/          LiteratureProvider contract, Aggregator, registry, cursor
    mock.ts pubmed.ts openalex.ts semanticScholar.ts biorxiv.ts
    enrichers/sjr.ts  PaperEnricher: SJR journal quartile by ISSN
  pipeline/           report template (from report.html) + references + stream
tests/                vitest: queue (concurrency/retry/dedup), hub (replay), scheduler
fixtures/
  facets.json         23 fields, 236 countries, ranks, sources, designs, modes
  papers.json         12 normalized sample papers
  sjr.json            ISSN -> SJR quartile sample (full Scimago CSV drops in here)
  http/               recorded API responses used by the provider tests
tests/                vitest provider/enricher/aggregator tests (network-free)
```

## Persistence

Data access goes through a **repository layer** (`repo/`), not raw Maps. Each
aggregate is a `CachedRepo`: a fast in-memory cache (the synchronous API the
routes use) write-through to a durable `Repository`. The default durable driver
is in-memory (offline, tested); `DB_DRIVER=postgres` stores each aggregate as one
JSONB row. Adding a driver = implement `Repository`/`KvStore` + a registry line.

`store.init()` hydrates the caches at startup and seeds defaults. Report streaming
partials are cache-only (ephemeral); the durable copy is written at create and at
the terminal event. Each report carries `provenance` (corpus size + pinned model
versions per `version`) for reproducibility.

```bash
DB_DRIVER=postgres DATABASE_URL=postgres://localhost:5432/corpus npm run migrate
DB_DRIVER=postgres DATABASE_URL=postgres://localhost:5432/corpus npm run mock
```

## Jobs & scale

Report generation is **queued**, not run inline. `POST /reports` enqueues a job;
a bounded **worker pool** (`queue/`, default in-memory with retries + idempotent
jobIds; `QUEUE_DRIVER=bullmq` for Redis) runs the generator (Brain or fixture) and
publishes each event to the **hub** (`hub.ts`). The hub gives every event a
monotonic id, so an SSE client that drops can reconnect with `Last-Event-ID` and
the hub replays only what it missed before tailing live events — multiple
subscribers per report, no lost events. A weekly **scheduler** (`ENABLE_SCHEDULER=1`)
re-enqueues `cadence: weekly` reports past the cadence at the next version.

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
