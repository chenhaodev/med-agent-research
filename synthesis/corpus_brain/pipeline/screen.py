"""Screen — rank candidate papers for relevance into a PRISMA funnel.

Each candidate is judged by the screening tier (Haiku in production); Python
aggregates the per-paper decisions into the funnel counts and the included set.
"""
from __future__ import annotations

from typing import Any

from ..contract import funnel_stage
from ..llm import LLMClient, ModelTier
from .models import ScreenOutcome, ScreenResult, paper_text

MAX_INCLUDED = 24

SCREEN_SYSTEM = (
    "You are a systematic-review screener. Decide whether a paper is relevant to "
    "the research question. Be strict: relevance means the study directly informs "
    "the question's intervention and outcomes. Respond via the schema only."
)

SCREEN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "relevant": {"type": "boolean"},
        "relevanceScore": {"type": "number", "minimum": 0, "maximum": 1},
        "reason": {"type": "string"},
    },
    "required": ["relevant", "relevanceScore", "reason"],
}


def _screen_prompt(question: str, paper: dict[str, Any]) -> str:
    return (
        f"QUESTION: {question}\n\n"
        f"PAPER:\n{paper_text(paper)[:2000]}\n\n"
        "Is this paper relevant to the question?"
    )


def screen(
    question: str, papers: list[dict[str, Any]], corpus_size: int, llm: LLMClient
) -> ScreenOutcome:
    results: list[ScreenResult] = []
    for paper in papers:
        decision = llm.structured(
            ModelTier.SCREEN, SCREEN_SYSTEM, _screen_prompt(question, paper), SCREEN_SCHEMA
        )
        results.append(
            ScreenResult(
                paper_id=paper["id"],
                relevant=bool(decision.get("relevant")),
                score=float(decision.get("relevanceScore", 0.0)),
            )
        )

    by_id = {p["id"]: p for p in papers}
    passed = [r for r in results if r.relevant]
    passed.sort(key=lambda r: r.score, reverse=True)
    included = [by_id[r.paper_id] for r in passed[:MAX_INCLUDED]]

    pool = len(papers)
    screened_in = len(passed)
    stages = [
        funnel_stage("retrieved", "Retrieved", max(corpus_size, pool)),
        funnel_stage("relevant", "Relevant", pool),
        funnel_stage("candidates", "Candidates", max(screened_in, len(included))),
        funnel_stage("included", "Included", len(included)),
    ]
    return ScreenOutcome(
        funnel_stages=stages,
        included=included,
        scores={r.paper_id: r.score for r in results},
    )
