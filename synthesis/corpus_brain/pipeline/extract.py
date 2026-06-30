"""Extract — per-paper structured extraction via a schema-validated tool call.

For each included paper the extraction tier (Sonnet) returns study design,
sample size, outcome, effect direction, the paper's stance on the question, and
a supporting quote. The strict json_schema guarantees a parseable, typed record.
"""
from __future__ import annotations

from typing import Any

from ..llm import LLMClient, ModelTier
from .models import Extraction, paper_text, short_authors

EXTRACT_SYSTEM = (
    "You are a biomedical evidence-extraction model. From a single paper, extract "
    "structured findings about the research question. The stance is the paper's own "
    "answer to the question. Quote a short verbatim span that supports the stance. "
    "Respond via the schema only; do not invent data not present in the paper."
)

STUDY_DESIGNS = ["rct", "cohort", "review", "meta-analysis", "observational", "other"]
EFFECT_DIRECTIONS = ["positive", "negative", "none", "mixed"]
STANCES = ["yes", "possibly", "mixed", "no", "na"]

EXTRACT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "studyDesign": {"type": "string", "enum": STUDY_DESIGNS},
        "sampleSize": {"type": "integer", "minimum": 0, "maximum": 1_000_000},
        "outcome": {"type": "string"},
        "effectDirection": {"type": "string", "enum": EFFECT_DIRECTIONS},
        "stance": {"type": "string", "enum": STANCES},
        "supportingQuote": {"type": "string"},
    },
    "required": ["studyDesign", "sampleSize", "outcome", "effectDirection", "stance", "supportingQuote"],
}


def _extract_prompt(question: str, paper: dict[str, Any]) -> str:
    return (
        f"QUESTION: {question}\n\n"
        f"PAPER ({short_authors(paper)}, {paper.get('year', 'n.d.')}):\n"
        f"{paper_text(paper)[:6000]}\n\n"
        "Extract the structured findings."
    )


def extract(question: str, included: list[dict[str, Any]], llm: LLMClient) -> list[Extraction]:
    extractions: list[Extraction] = []
    for i, paper in enumerate(included):
        data = llm.structured(
            ModelTier.EXTRACT, EXTRACT_SYSTEM, _extract_prompt(question, paper), EXTRACT_SCHEMA
        )
        extractions.append(
            Extraction(
                paper_id=paper["id"],
                ref_id=f"r{i + 1}",
                number=i + 1,
                study_design=_one_of(data.get("studyDesign"), STUDY_DESIGNS, "other"),
                sample_size=int(data.get("sampleSize", 0) or 0),
                outcome=str(data.get("outcome") or "primary outcome"),
                effect_direction=_one_of(data.get("effectDirection"), EFFECT_DIRECTIONS, "none"),
                stance=_one_of(data.get("stance"), STANCES, "na"),
                quote=str(data.get("supportingQuote") or ""),
            )
        )
    return extractions


def _one_of(value: Any, allowed: list[str], default: str) -> str:
    return value if value in allowed else default
