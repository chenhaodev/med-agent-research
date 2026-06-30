# Corpus synthesis brain

The synthesis engine — a standalone Python worker that turns a `ResearchQuery` +
a candidate corpus into a `SynthesisReport`, speaking the **same event contract**
as the mock pipeline (`server/src/pipeline/stream.ts`). It replaces the fixture
report with a real **screen → extract → grade → synthesize** pipeline driven by
Claude, and emits `ReportEvent`s as newline-delimited JSON so the Node API
gateway relays them over SSE unchanged. Zero contract churn; the frontend never
knows the difference.

```
                 stdin: { reportId, query, papers[] }
                                │
        ┌───────────────────────▼────────────────────────┐
        │  screen → extract → grade → synthesize          │
        │  (Haiku)  (Sonnet)  (Python)  (Opus)            │
        └───────────────────────┬────────────────────────┘
                                │  stdout: NDJSON ReportEvents
              status · funnel · meter · block… · references · done
```

## Pipeline

| Stage | Tier | What it does |
|---|---|---|
| **screen** | Haiku | relevance-judge each candidate → PRISMA **funnel** counts + included set |
| **extract** | Sonnet | per-paper **schema-validated** extraction (design, sample size, outcome, effect direction, stance, supporting quote) |
| **grade** | Python | aggregate stances → **consensus meter**; effect directions → **evidence matrix**; GRADE-strength **claims** traceable to refIds |
| **synthesize** | Opus | compose prose blocks; every `{{cite:N}}` must resolve to a real reference or the **grounding guardrail** strips it |

Model strategy follows the roadmap: Haiku for high-volume screening, Sonnet for
extraction, Opus for synthesis (adaptive thinking + `effort: high`); the system
prompt is prompt-cached across per-paper calls, and a per-report **token budget**
caps spend.

## Backends

The pipeline depends only on the `LLMClient` interface. Two backends implement it:

- **AnthropicLLM** — real Claude, model-tiered, structured outputs, prompt caching.
  Used when `ANTHROPIC_API_KEY` is set.
- **StubLLM** — deterministic, offline, zero dependencies. Used in tests, CI, and
  no-key dev. The *structure* is real; only the judgments are simulated. Force it
  with `CORPUS_BRAIN_STUB=1`.

## Run

```bash
# Offline (deterministic stub) — no API key needed
echo '{"reportId":"rep_x","query":{"question":"mobile health","mode":"keyword","filters":{}},
       "papers":[{"id":"p1","title":"RCT of an mHealth app","abstract":"...","authors":[{"name":"Smith"}],
                  "year":2024,"venue":{"name":"JMIR","type":"journal"},"citationCount":120}]}' \
  | CORPUS_BRAIN_STUB=1 python3 synthesis/run.py

# Real Claude
export ANTHROPIC_API_KEY=sk-...
echo '{...job...}' | python3 synthesis/run.py
```

### Driven by the gateway

The Node server runs the worker when `USE_BRAIN=1`: it retrieves a candidate
corpus via the provider aggregator, spawns `synthesis/run.py` with the job spec,
and relays the worker's events over SSE (`server/src/brain.ts`). With `USE_BRAIN`
unset, the fixture path is unchanged.

```bash
cd server && USE_BRAIN=1 npm run mock          # real Claude (needs ANTHROPIC_API_KEY)
cd server && USE_BRAIN=1 CORPUS_BRAIN_STUB=1 npm run mock   # offline brain
```

| Var | Default | Purpose |
|---|---|---|
| `USE_BRAIN` | unset | `1` routes `/reports` through the worker instead of the fixture |
| `BRAIN_CMD` | `python3 synthesis/run.py` | worker command (argv) |
| `BRAIN_CANDIDATES` | `40` | candidate corpus size pulled before screening |
| `CORPUS_BRAIN_STUB` | unset | `1` forces the offline deterministic backend |
| `CORPUS_BRAIN_MAX_TOKENS` | unset | per-report token budget (hard ceiling) |
| `ANTHROPIC_API_KEY` | unset | enables the real Claude backend |

## Tests & the eval gate

```bash
cd synthesis
python3 -m pytest          # stage, orchestrator, guardrail, budget, eval — all offline
python3 eval_gate.py       # release gate: scores the gold set, exits non-zero on any breach
```

The **eval harness is a release blocker**, not a nice-to-have: a medical synthesis
product is only as trustworthy as its grounding metrics. The gate scores citation
grounding, hallucinated-citation detection, claim faithfulness, and structural
completeness over a gold question set, and fails the build if any gate is breached.

## Layout

```
run.py                entrypoint: stdin job spec → stdout NDJSON ReportEvents
eval_gate.py          CI release gate over the gold set
corpus_brain/
  contract.py         ReportEvent + ContentBlock builders (mirror /api/types.ts)
  budget.py           per-report token budget
  llm/                LLMClient + AnthropicLLM (real) + StubLLM (offline)
  pipeline/           screen · extract · grade · synthesize · orchestrator
  eval/               harness (metrics + gates) + gold question set
tests/                pytest suite (offline)
```

> **Not clinical advice.** Every claim is traceable to a `Reference`; the
> grounding guardrail rejects ungrounded citations. Provenance and reproducibility
> (pinned corpus + model version) are first-class for the medical product.
