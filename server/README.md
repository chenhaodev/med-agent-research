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
npm test              # vitest — queue / hub / scheduler unit tests
```

Environment:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Listen port |
| `STREAM_STEP_MS` | `220` | Delay between SSE events (fixture path; lower = faster) |
| `USE_LIVE_PUBMED` | unset | `1` routes `/papers` through the real NCBI E-utilities adapter |
| `NCBI_API_KEY` | unset | Optional PubMed API key (higher rate limit) |
| `MOCK_TOKEN` | `mock-token-corpus` | The static bearer token the mock issues/accepts |
| `USE_BRAIN` | unset | `1` generates reports via the Python synthesis worker (see [`../synthesis`](../synthesis/README.md)) |
| `QUEUE_DRIVER` | `memory` | Job queue driver: `memory` (in-process) or `bullmq` (Redis) |
| `QUEUE_CONCURRENCY` | `4` | Concurrent report-generation jobs |
| `QUEUE_MAX_ATTEMPTS` | `3` | Attempts per job before it is marked failed |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection for the `bullmq` driver |
| `ENABLE_SCHEDULER` | unset | `1` runs the weekly recompute scheduler |
| `WEEKLY_CADENCE_MS` | `604800000` | Recompute cadence for `cadence: weekly` reports |

## Layout

```
src/
  index.ts            Fastify app + route registration + worker/scheduler startup
  config.ts           env-sourced config
  store.ts            in-memory stores (reports, jobs, saved, history, collections)
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
  providers/          LiteratureProvider contract + Mock / PubMed / Aggregator
  pipeline/           report template (from report.html) + references + stream
tests/                vitest: queue (concurrency/retry/dedup), hub (replay), scheduler
fixtures/
  facets.json         23 fields, 236 countries, ranks, sources, designs, modes
  papers.json         12 normalized sample papers
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

`Aggregator` fans out across the active providers, dedups by DOI, enriches, and
applies shared post-filters. With `USE_LIVE_PUBMED=1` it uses `PubMedProvider`
(real esearch/efetch); otherwise `MockProvider` serves the fixtures. Adding a
source = implement `LiteratureProvider` and register it in `aggregator.ts`.
