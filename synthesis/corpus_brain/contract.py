"""The event + block contract, mirroring /api/types.ts.

THIS MIRRORS api/types.ts — when they disagree, types.ts wins. The worker emits
`ReportEvent` dicts ({"event": ..., "data": ...}); the block builders produce
`ContentBlock` dicts the browser renderer (js/api.js) already understands.

Kept as plain dict builders (no serialization framework) so the wire shape is
obvious and 1:1 with the TypeScript union.
"""
from __future__ import annotations

from typing import Any, Literal

Stance = Literal["yes", "possibly", "mixed", "no", "na"]
Grade = Literal["strong", "moderate", "weak", "emerging", "mixed"]
ReportPhase = Literal[
    "retrieving", "screening", "extracting", "grading", "synthesizing", "complete"
]

# ----------------------------------------------------------------------------
# ReportEvent constructors — the SSE event stream
# ----------------------------------------------------------------------------


def status(phase: ReportPhase, progress: float, message: str) -> dict[str, Any]:
    return {"event": "status", "data": {"phase": phase, "progress": progress, "message": message}}


def funnel(stages: list[dict[str, Any]]) -> dict[str, Any]:
    return {"event": "funnel", "data": {"stages": stages}}


def meter(question: str, n: int, buckets: list[dict[str, Any]]) -> dict[str, Any]:
    return {"event": "meter", "data": {"question": question, "n": n, "buckets": buckets}}


def block_event(block: dict[str, Any]) -> dict[str, Any]:
    return {"event": "block", "data": {"block": block}}


def references_event(added: list[dict[str, Any]]) -> dict[str, Any]:
    return {"event": "references", "data": {"added": added}}


def done(report: dict[str, Any]) -> dict[str, Any]:
    return {"event": "done", "data": {"report": report}}


def error(code: str, message: str) -> dict[str, Any]:
    return {"event": "error", "data": {"code": code, "message": message}}


# ----------------------------------------------------------------------------
# ContentBlock builders — the ordered report body
# ----------------------------------------------------------------------------


def funnel_stage(stage: str, label: str, count: int) -> dict[str, Any]:
    return {"stage": stage, "label": label, "count": count}


def heading(level: int, text: str, number: str | None = None) -> dict[str, Any]:
    b: dict[str, Any] = {"type": "heading", "level": level, "text": text}
    if number:
        b["number"] = number
    return b


def tldr(html: str, label: str = "TL;DR") -> dict[str, Any]:
    return {"type": "tldr", "label": label, "html": html}


def prose(html: str, citations: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "prose", "html": html, "citations": citations}


def citation(ref_id: str, number: int, stance: Stance, tooltip: str = "") -> dict[str, Any]:
    return {"refId": ref_id, "number": number, "stance": stance, "tooltip": tooltip}


def consensus_meter(
    question: str, n: int, buckets: list[dict[str, Any]], caption: str | None = None
) -> dict[str, Any]:
    b: dict[str, Any] = {"type": "consensusMeter", "question": question, "n": n, "buckets": buckets}
    if caption:
        b["caption"] = caption
    return b


def funnel_block(stages: list[dict[str, Any]], caption: str | None = None) -> dict[str, Any]:
    b: dict[str, Any] = {"type": "funnel", "stages": stages}
    if caption:
        b["caption"] = caption
    return b


def key_papers(items: list[dict[str, Any]], caption: str | None = None) -> dict[str, Any]:
    b: dict[str, Any] = {"type": "keyPapers", "items": items}
    if caption:
        b["caption"] = caption
    return b


def evidence_matrix(rows: list[dict[str, Any]], caption: str | None = None) -> dict[str, Any]:
    b: dict[str, Any] = {"type": "evidenceMatrix", "rows": rows}
    if caption:
        b["caption"] = caption
    return b


def claims(rows: list[dict[str, Any]], caption: str | None = None) -> dict[str, Any]:
    b: dict[str, Any] = {"type": "claims", "rows": rows}
    if caption:
        b["caption"] = caption
    return b


def timeline(
    axis_from: int, axis_to: int, points: list[dict[str, Any]], caption: str | None = None
) -> dict[str, Any]:
    b: dict[str, Any] = {"type": "timeline", "axis": {"from": axis_from, "to": axis_to}, "points": points}
    if caption:
        b["caption"] = caption
    return b


def open_questions(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "openQuestions", "items": items}


STANCE_LABELS: dict[str, str] = {
    "yes": "Yes",
    "possibly": "Possibly",
    "mixed": "Mixed",
    "no": "No",
    "na": "NA",
}
