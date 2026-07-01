"""Orchestrator — runs the pipeline and emits the report event stream.

Yields ReportEvents in the contract order (status → funnel → meter → blocks →
references → done), running each stage between the status ticks so timing
reflects real work. Mirrors server/src/pipeline/stream.ts.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterator

from .. import contract
from ..budget import Budget, BudgetExceeded
from ..llm import LLMClient
from ..llm.base import DEFAULT_MODELS, ModelTier
from . import extract as extract_stage
from . import grade as grade_stage
from . import screen as screen_stage
from . import synthesize as synth_stage


def _provenance(job: dict[str, Any], corpus_size: int, ts: str, llm: LLMClient) -> dict[str, Any]:
    """Pin corpus + model versions so the report can be reproduced at this version."""
    papers = job.get("papers") or []
    sources = sorted({p.get("provider") for p in papers if p.get("provider")})
    return {
        "pinnedAt": ts,
        "corpusSize": corpus_size,
        "sources": sources,
        "models": {tier.value: DEFAULT_MODELS[tier] for tier in ModelTier},
        "generator": "brain",
        "backend": type(llm).__name__,
    }


def _now_iso(job: dict[str, Any]) -> str:
    stamped = job.get("now")
    if isinstance(stamped, str) and stamped:
        return stamped
    return datetime.now(timezone.utc).isoformat()


def run_report(job: dict[str, Any], llm: LLMClient, budget: Budget) -> Iterator[dict[str, Any]]:
    query = job.get("query") or {}
    topic = (query.get("question") or "").strip() or "[your research topic]"
    papers = job.get("papers") or []
    corpus_size = int(job.get("corpusSize") or len(papers))
    ts = _now_iso(job)

    try:
        yield contract.status("retrieving", 0.05, "Retrieving candidate records")

        yield contract.status("screening", 0.18, "Screening for relevance")
        screened = screen_stage.screen(topic, papers, corpus_size, llm)
        yield contract.funnel(screened.funnel_stages)

        yield contract.status("extracting", 0.35, "Extracting findings")
        extractions = extract_stage.extract(topic, screened.included, llm)

        yield contract.status("grading", 0.6, "Grading evidence strength")
        graded = grade_stage.grade(screened.included, extractions)
        yield contract.meter(
            f"Does the evidence support: {topic}?", graded.contributing_studies, graded.meter_buckets
        )

        yield contract.status("synthesizing", 0.8, "Composing synthesis")
        blocks, references, reading_time, grounding = synth_stage.synthesize(
            topic, screened.included, extractions, graded, screened.funnel_stages, llm
        )

        for block in blocks:
            yield contract.block_event(block)
        yield contract.references_event(references)

        yield contract.status("complete", 1.0, "Report complete")

        report = {
            "id": job.get("reportId", "rep_unknown"),
            "query": query,
            "status": "complete",
            "version": 1,
            "generatedAt": ts,
            "updatedAt": ts,
            "cadence": "manual",
            "topic": topic,
            "readingTimeMin": reading_time,
            "consensus": {"label": graded.consensus_label, "strength": graded.consensus_strength},
            "metrics": {"contributingStudies": graded.contributing_studies, "corpusSize": corpus_size},
            "funnel": {"stages": screened.funnel_stages},
            "blocks": blocks,
            "references": references,
            "provenance": _provenance(job, corpus_size, ts, llm),
            "diagnostics": {"budget": budget.summary(), "grounding": grounding},
        }
        yield contract.done(report)
    except BudgetExceeded as exc:
        yield contract.error("budget_exceeded", str(exc))
    except Exception as exc:  # surface any stage failure as a contract error event
        yield contract.error("synthesis_failed", f"{type(exc).__name__}: {exc}")
