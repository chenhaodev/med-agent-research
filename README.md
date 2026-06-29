# Corpus — research-synthesis assistant

A Consensus/Elicit-style academic research assistant: a **Paper Search** landing page and a
**Research Report** synthesis document (a PRISMA funnel + consensus meter + GRADE-style evidence
grading + cited synthesis). The frontend is static; this repo also defines and mocks the backend
interface behind it.

## What's here

```
index.html  report.html        Static frontend (Paper Search + Research Report)
css/  js/                       Shared tokens/styles + vanilla-JS behaviours
js/api.js                       Browser API client (fetch + EventSource) + ContentBlock renderer
demo.html                       Live, API-backed Research Report (proves the contract end-to-end)

api/types.ts                    The contract — single source of truth
api/openapi.yaml                OpenAPI 3.1, mirrors types.ts
server/                         Runnable mock backend (Fastify + TS, no DB)
docs/INTERFACE.md               Narrative: flows, SSE stream, error model, versioning, mapping
```

## Quick start

```bash
# 1. Mock backend on :8787
cd server && npm install && npm run mock

# 2. Static frontend on :8731 (separate shell, from repo root)
python3 -m http.server 8731

# 3. See the report build itself from the API
open http://localhost:8731/demo.html
```

`curl` walkthrough and the full endpoint reference live in [`docs/INTERFACE.md`](docs/INTERFACE.md).
Swap real literature sources in behind the mock (e.g. live PubMed via `USE_LIVE_PUBMED=1`) with no
frontend change — see [`server/README.md`](server/README.md).

## Design in one line

A report is an **ordered list of typed `ContentBlock`s** with a first-class **citation layer**, all
driven by one **`ResearchQuery`** — so new figures ship backend-first and the frontend's hardcoded
data is replaced by live calls with zero contract churn.
