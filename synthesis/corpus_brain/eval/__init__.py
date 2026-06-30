"""Evaluation harness — the release gate for the synthesis brain.

A medical synthesis product is only as trustworthy as its grounding metrics, so
the eval harness is a blocker, not a nice-to-have: it scores citation grounding,
hallucinated-citation detection, claim faithfulness, and structural completeness
over a gold question set, and fails the build if any gate is breached.
"""
from __future__ import annotations

from .harness import GATES, evaluate_report

__all__ = ["GATES", "evaluate_report"]
