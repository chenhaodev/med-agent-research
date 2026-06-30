# Corpus — research-synthesis assistant

A Consensus/Elicit-style medical research assistant: a **Paper Search** landing page and a
**Research Report** synthesis document (a PRISMA funnel + consensus meter + GRADE-style evidence
grading + cited synthesis). A static frontend calls a versioned API; this repo defines the contract,
a runnable mock backend, real literature providers, and a Claude-driven synthesis engine behind it.

## What's here

```
index.html  report.html        Frontend (Paper Search + Research Report) — calls the live API
css/  js/                       Shared tokens/styles + vanilla-JS behaviours
js/config.js                    Single, overridable API base (window.CORPUS_API_BASE)
js/api.js                       Browser API client (fetch + EventSource) + ContentBlock renderer
js/report-view.js               Shared streaming + render + behavior re-init (used by both pages)
js/paper-search.js              Search drawer: reads a ResearchQuery, facets from /facets, submit→report
js/app.js                       Report page controller (dynamic via ?reportId, static fallback)
demo.html                       Thin harness over report-view.js (proves the module is reusable)

api/types.ts                    The contract — single source of truth
api/openapi.yaml                OpenAPI 3.1, mirrors types.ts
server/                         Runnable mock backend (Fastify + TS, no DB): providers, queue, hub
synthesis/                      The Brain — Python worker (screen→extract→grade→synthesize via Claude)
tests/                          Vitest unit tests + Playwright e2e (frontend)
docs/INTERFACE.md               Narrative: flows, SSE stream, error model, versioning, mapping
```

## Quick start

```bash
# 1. Mock backend on :8787
cd server && npm install && npm run mock

# 2. Static frontend on :8731 (separate shell, from repo root)
python3 -m http.server 8731

# 3. Use the real app: search a question, then watch the report stream in
open http://localhost:8731/index.html      # type a question → report.html?reportId=…
open http://localhost:8731/demo.html        # or the auto-running demo harness
```

The two pages call the live API: **Paper Search** reads the drawer + searchbox into a
`ResearchQuery`, fills its filter catalogs from `GET /facets`, and on submit creates a report and
navigates to `report.html?reportId=…`, which streams the body in over SSE. Opening `report.html`
with no `reportId` shows a static sample as a graceful fallback. Point the pages at any backend by
setting `window.CORPUS_API_BASE` (or `?api=…`).

`curl` walkthrough and the full endpoint reference live in [`docs/INTERFACE.md`](docs/INTERFACE.md).
Swap real literature sources in behind the mock (OpenAlex / Semantic Scholar / bioRxiv / live PubMed)
with no frontend change — see [`server/README.md`](server/README.md).

## The Brain (real synthesis)

By default `/reports` returns a fixture. Set `USE_BRAIN=1` and the server routes report generation
through the **synthesis worker** ([`synthesis/`](synthesis/README.md)) — a real
**screen → extract → grade → synthesize** pipeline driven by Claude (Haiku screens, Sonnet extracts,
Opus synthesizes) that emits the *same* SSE events, so the frontend is unchanged. Every claim is
grounded to a `Reference`; a citation guardrail rejects ungrounded citations; an eval harness gates
the build on grounding metrics. Runs fully offline with `CORPUS_BRAIN_STUB=1` (deterministic stub).

Generation is queued (bounded worker pool, retries) and streamed over a pub/sub hub with
`Last-Event-ID` reconnection — see [`server/README.md`](server/README.md) → Jobs & scale.

## Tests

Everything runs offline — no network or API key.

```bash
npm install && npm test                         # frontend: Vitest+jsdom unit + Playwright e2e
cd server && npm install && npm test            # server: providers, queue, hub, scheduler
cd synthesis && python3 -m pytest               # brain: pipeline, guardrail, budget, eval
cd synthesis && python3 eval_gate.py            # the Brain's release gate (grounding metrics)
```

## Design in one line

A report is an **ordered list of typed `ContentBlock`s** with a first-class **citation layer**, all
driven by one **`ResearchQuery`** — so new figures ship backend-first and the frontend's hardcoded
data is replaced by live calls with zero contract churn.
