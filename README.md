# Corpus — research-synthesis assistant

A Consensus/Elicit-style academic research assistant: a **Paper Search** landing page and a
**Research Report** synthesis document (a PRISMA funnel + consensus meter + GRADE-style evidence
grading + cited synthesis). The frontend is static; this repo also defines and mocks the backend
interface behind it.

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
server/                         Runnable mock backend (Fastify + TS, no DB)
tests/                          Vitest unit tests + Playwright e2e
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

The two pages now call the live API: **Paper Search** reads the drawer + searchbox into a
`ResearchQuery`, fills its filter catalogs from `GET /facets`, and on submit creates a report and
navigates to `report.html?reportId=…`, which streams the body in over SSE. Opening `report.html`
with no `reportId` shows a static sample as a graceful fallback. Point the pages at any backend by
setting `window.CORPUS_API_BASE` (or `?api=…`).

`curl` walkthrough and the full endpoint reference live in [`docs/INTERFACE.md`](docs/INTERFACE.md).
Swap real literature sources in behind the mock (e.g. live PubMed via `USE_LIVE_PUBMED=1`) with no
frontend change — see [`server/README.md`](server/README.md).

## Tests

```bash
npm install                 # frontend dev deps (Vitest, Playwright, jsdom)
npm run test:unit           # Vitest + jsdom: readQuery() and every ContentBlock renderer
npm run test:coverage       # same, with a coverage report
npm run test:e2e:install    # one-time: download the Playwright browser
npm run test:e2e            # Playwright: index → submit → report streams, zero console errors
npm test                    # unit + e2e
```

The e2e harness starts the mock backend (:8787) and a static server (:8731) automatically.

## Design in one line

A report is an **ordered list of typed `ContentBlock`s** with a first-class **citation layer**, all
driven by one **`ResearchQuery`** — so new figures ship backend-first and the frontend's hardcoded
data is replaced by live calls with zero contract churn.
