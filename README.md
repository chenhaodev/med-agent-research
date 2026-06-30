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
synthesis/                      The Brain — Python worker (screen→extract→grade→synthesize via Claude)
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

## The Brain (real synthesis)

By default `/reports` returns a fixture. Set `USE_BRAIN=1` and the server routes report generation
through the **synthesis worker** ([`synthesis/`](synthesis/README.md)) — a real
**screen → extract → grade → synthesize** pipeline driven by Claude (Haiku screens, Sonnet extracts,
Opus synthesizes) that emits the *same* SSE events, so the frontend is unchanged. Every claim is
grounded to a `Reference`; a citation guardrail rejects ungrounded citations; an eval harness gates
the build on grounding metrics. Runs fully offline with `CORPUS_BRAIN_STUB=1` (deterministic stub).

```bash
cd server && USE_BRAIN=1 CORPUS_BRAIN_STUB=1 npm run mock   # offline brain, no API key
cd synthesis && python3 -m pytest && python3 eval_gate.py    # tests + release gate
```

## Design in one line

A report is an **ordered list of typed `ContentBlock`s** with a first-class **citation layer**, all
driven by one **`ResearchQuery`** — so new figures ship backend-first and the frontend's hardcoded
data is replaced by live calls with zero contract churn.
