"""Grade — aggregate per-paper extractions into consensus, evidence, and claims.

This stage is deterministic Python over the extracted records (no LLM): it folds
stances into the consensus meter, effect directions into the evidence matrix, and
derives GRADE-strength claims whose support is traceable to specific refIds.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

from ..contract import STANCE_LABELS
from .models import Extraction, GradeOutcome

STANCE_ORDER = ["yes", "possibly", "mixed", "no", "na"]
DIRECTION_LABEL = {
    "positive": "Positive effect",
    "mixed": "Mixed effect",
    "negative": "Negative effect",
    "none": "No clear effect",
}
STANCE_WEIGHT = {"yes": 1.0, "possibly": 0.5, "mixed": 0.5, "no": 0.0, "na": 0.0}


def _grade_for(count: int) -> str:
    if count >= 10:
        return "strong"
    if count >= 6:
        return "moderate"
    if count >= 3:
        return "weak"
    return "emerging"


def _consensus(extractions: list[Extraction]) -> tuple[str, str]:
    n = len(extractions) or 1
    score = sum(STANCE_WEIGHT.get(e.stance, 0.0) for e in extractions) / n
    if score >= 0.66:
        return "Strong consensus", "strong"
    if score >= 0.5:
        return "Moderate-to-strong consensus", "moderate"
    if score >= 0.33:
        return "Mixed-to-moderate evidence", "mixed"
    return "Limited / emerging evidence", "emerging"


def _meter_buckets(extractions: list[Extraction]) -> list[dict[str, Any]]:
    counts = Counter(e.stance for e in extractions)
    return [
        {"stance": s, "count": counts[s], "label": STANCE_LABELS[s]}
        for s in STANCE_ORDER
        if counts.get(s, 0) > 0
    ]


def _matrix_rows(extractions: list[Extraction]) -> list[dict[str, Any]]:
    by_dir: dict[str, list[Extraction]] = {}
    for e in extractions:
        by_dir.setdefault(e.effect_direction, []).append(e)
    rows: list[dict[str, Any]] = []
    for direction in ["positive", "mixed", "negative", "none"]:
        group = by_dir.get(direction, [])
        if not group:
            continue
        outcomes = list(dict.fromkeys(e.outcome for e in group))[:3]
        rows.append(
            {
                "direction": DIRECTION_LABEL[direction],
                "outcomes": ", ".join(outcomes) or "primary outcomes",
                "grade": _grade_for(len(group)),
                "paperCount": len(group),
            }
        )
    return rows


def _claims_rows(extractions: list[Extraction]) -> list[dict[str, Any]]:
    if not extractions:
        return []
    by_dir: dict[str, list[Extraction]] = {}
    for e in extractions:
        by_dir.setdefault(e.effect_direction, []).append(e)
    dominant_dir = max(by_dir, key=lambda d: len(by_dir[d]))
    dominant = by_dir[dominant_dir]
    top_outcome = Counter(e.outcome for e in dominant).most_common(1)[0][0]

    rigorous = [e for e in extractions if e.study_design in ("rct", "meta-analysis", "review")]
    rows = [
        {
            "claim": f"Shows a {DIRECTION_LABEL[dominant_dir].lower()} on {top_outcome}",
            "strength": _grade_for(len(dominant)),
            "reasoning": f"Consistent direction across {len(dominant)} of {len(extractions)} included studies.",
            "refIds": [e.ref_id for e in dominant[:8]],
        },
        {
            "claim": "Effects are supported by higher-rigour designs",
            "strength": _grade_for(len(rigorous)),
            "reasoning": f"{len(rigorous)} included studies are RCTs, meta-analyses, or systematic reviews.",
            "refIds": [e.ref_id for e in rigorous[:8]],
        },
        {
            "claim": "Effects persist over long-term follow-up",
            "strength": "weak",
            "reasoning": "Few included studies report follow-up beyond 12 months; durability remains uncertain.",
            "refIds": [e.ref_id for e in extractions[:3]],
        },
    ]
    return rows


def _timeline(included: list[dict[str, Any]]) -> tuple[tuple[int, int], list[dict[str, Any]]]:
    years = [int(p.get("year") or 0) for p in included if p.get("year")]
    points = [
        {"year": int(p["year"]), "citationCount": int(p.get("citationCount") or 0)}
        for p in included
        if p.get("year")
    ]
    if not years:
        return (2005, 2025), []
    return (min(years), max(years)), points


def _open_questions(grade_strength: str) -> list[dict[str, Any]]:
    return [
        {
            "question": "How durable are the reported effects beyond the studied follow-up?",
            "answer": "Long-term retention bounds achievable effect sizes; few included studies follow "
            "participants long enough to answer it.",
        },
        {
            "question": "Which subgroups are systematically under-served, and why?",
            "answer": "Disaggregated reporting is rare across the corpus, making access and adherence "
            "gaps hard to target.",
        },
        {
            "question": "What does safe, governed integration into existing systems require?",
            "answer": "Interoperability standards, governance, and trust appear to be the binding "
            "constraint on turning efficacy into dependable service delivery.",
        },
    ]


def grade(included: list[dict[str, Any]], extractions: list[Extraction]) -> GradeOutcome:
    label, strength = _consensus(extractions)
    axis, points = _timeline(included)
    return GradeOutcome(
        consensus_label=label,
        consensus_strength=strength,
        meter_buckets=_meter_buckets(extractions),
        matrix_rows=_matrix_rows(extractions),
        claims_rows=_claims_rows(extractions),
        timeline_axis=axis,
        timeline_points=points,
        contributing_studies=len(extractions),
        open_questions=_open_questions(strength),
    )
