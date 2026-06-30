"""Lightweight data shapes for the pipeline.

Papers arrive as normalized `Paper` dicts (from the provider aggregator); these
helpers read them defensively and carry the per-paper analysis forward.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def paper_text(paper: dict[str, Any]) -> str:
    """Title + abstract, for relevance signals and prompts."""
    return f"{paper.get('title', '')}\n{paper.get('abstract', '') or ''}".strip()


def author_names(paper: dict[str, Any]) -> list[str]:
    return [a.get("name", "") for a in paper.get("authors", []) if a.get("name")]


def short_authors(paper: dict[str, Any]) -> str:
    names = author_names(paper)
    if not names:
        return "Unknown authors"
    return f"{names[0]} et al." if len(names) > 1 else names[0]


@dataclass
class ScreenResult:
    paper_id: str
    relevant: bool
    score: float


@dataclass
class ScreenOutcome:
    funnel_stages: list[dict[str, Any]]
    included: list[dict[str, Any]]  # included papers (top-ranked, screened-in)
    scores: dict[str, float]


@dataclass
class Extraction:
    paper_id: str
    ref_id: str
    number: int
    study_design: str
    sample_size: int
    outcome: str
    effect_direction: str  # positive | negative | none | mixed
    stance: str  # yes | possibly | mixed | no | na
    quote: str


@dataclass
class GradeOutcome:
    consensus_label: str
    consensus_strength: str
    meter_buckets: list[dict[str, Any]]
    matrix_rows: list[dict[str, Any]]
    claims_rows: list[dict[str, Any]]
    timeline_axis: tuple[int, int]
    timeline_points: list[dict[str, Any]]
    contributing_studies: int
    open_questions: list[dict[str, Any]] = field(default_factory=list)
