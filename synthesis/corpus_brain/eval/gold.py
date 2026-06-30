"""Gold question set + synthetic corpora for offline evaluation.

Each case is a question plus a small deterministic corpus, so the eval harness
runs end-to-end without a network (against the stub backend). The corpora are
synthetic but shaped like real normalized papers, exercising every stage.
"""
from __future__ import annotations

from typing import Any

from ..budget import Budget
from ..llm import StubLLM
from ..pipeline import run_report


def _paper(i: int, title: str, design: str, preprint: bool = False) -> dict[str, Any]:
    return {
        "id": f"p{i}",
        "title": title,
        "abstract": f"A {design} examining the question with reported outcomes and effect estimates.",
        "authors": [{"name": f"Author{i}, A."}, {"name": f"Coauthor{i}, B."}],
        "year": 2018 + (i % 8),
        "venue": {"name": "Journal of Evidence", "type": "preprint" if preprint else "journal", "quartile": "Q1"},
        "citationCount": 10 * i + 5,
        "isPreprint": preprint,
        "studyDesign": design,
        "externalIds": {"doi": f"10.1000/ev.{i}"},
        "url": f"https://example.org/p{i}",
    }


def _corpus(prefix: str) -> list[dict[str, Any]]:
    designs = ["rct", "meta-analysis", "cohort", "review", "observational", "rct", "cohort"]
    return [_paper(i + 1, f"{prefix}: study {i + 1}", d, preprint=(i % 5 == 0)) for i, d in enumerate(designs)]


GOLD: list[dict[str, Any]] = [
    {
        "id": "mhealth",
        "question": "effectiveness of mobile health interventions for chronic disease",
        "papers": _corpus("mHealth for chronic disease"),
    },
    {
        "id": "telemedicine",
        "question": "telemedicine for diabetes management",
        "papers": _corpus("Telemedicine and diabetes"),
    },
    {
        "id": "wearables",
        "question": "wearable activity trackers and physical activity",
        "papers": _corpus("Wearables and activity"),
    },
]


def run_case(case: dict[str, Any]) -> dict[str, Any]:
    """Run the pipeline (offline stub) for one gold case and return the done report."""
    budget = Budget()
    llm = StubLLM(budget)
    job = {
        "reportId": f"rep_{case['id']}",
        "query": {"question": case["question"], "mode": "keyword", "filters": {}},
        "papers": case["papers"],
        "corpusSize": 5_000_000,
        "now": "2026-06-30T00:00:00+00:00",
    }
    report: dict[str, Any] = {}
    for event in run_report(job, llm, budget):
        if event["event"] == "done":
            report = event["data"]["report"]
        elif event["event"] == "error":
            raise RuntimeError(event["data"]["message"])
    return report
