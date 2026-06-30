"""Report-quality metrics + release gates.

`evaluate_report` scores a finished report against the grounding/faithfulness
gates. The gates encode the medical-safety contract: every inline citation and
every claim reference must resolve to a real `Reference`, and the report must
carry the structural spine (funnel, consensus meter, claims, references).
"""
from __future__ import annotations

import re
from typing import Any

_CITE = re.compile(r"\{\{cite:(\d+)\}\}")

# Release gates — a report passes only if all hold.
GATES: dict[str, Any] = {
    "min_grounding_rate": 1.0,        # every inline citation resolves to a reference
    "max_hallucinated": 0,            # no {{cite:N}} or claim ref points at a missing reference
    "max_unresolved_claim_refs": 0,   # every claim's refIds exist
    "require_blocks": ["consensusMeter", "funnel", "claims"],
    "min_references": 1,
}


def _ref_numbers(report: dict[str, Any]) -> set[int]:
    return {int(r["number"]) for r in report.get("references", [])}


def _ref_ids(report: dict[str, Any]) -> set[str]:
    return {str(r["id"]) for r in report.get("references", [])}


def evaluate_report(report: dict[str, Any]) -> dict[str, Any]:
    blocks = report.get("blocks", [])
    ref_numbers = _ref_numbers(report)
    ref_ids = _ref_ids(report)

    total_citations = 0
    grounded_citations = 0
    hallucinated = 0

    for b in blocks:
        if b.get("type") != "prose":
            continue
        for c in b.get("citations", []):
            total_citations += 1
            if int(c.get("number", -1)) in ref_numbers:
                grounded_citations += 1
            else:
                hallucinated += 1
        # tokens must reference a real number too
        for m in _CITE.finditer(b.get("html", "")):
            if int(m.group(1)) not in ref_numbers:
                hallucinated += 1

    unresolved_claim_refs = 0
    for b in blocks:
        if b.get("type") != "claims":
            continue
        for row in b.get("rows", []):
            for rid in row.get("refIds", []):
                if rid not in ref_ids:
                    unresolved_claim_refs += 1

    present = {b.get("type") for b in blocks}
    missing_blocks = [t for t in GATES["require_blocks"] if t not in present]
    grounding_rate = 1.0 if total_citations == 0 else grounded_citations / total_citations

    passed = (
        grounding_rate >= GATES["min_grounding_rate"]
        and hallucinated <= GATES["max_hallucinated"]
        and unresolved_claim_refs <= GATES["max_unresolved_claim_refs"]
        and not missing_blocks
        and len(report.get("references", [])) >= GATES["min_references"]
    )

    return {
        "passed": passed,
        "groundingRate": round(grounding_rate, 4),
        "totalCitations": total_citations,
        "hallucinatedCitations": hallucinated,
        "unresolvedClaimRefs": unresolved_claim_refs,
        "missingBlocks": missing_blocks,
        "references": len(report.get("references", [])),
    }
