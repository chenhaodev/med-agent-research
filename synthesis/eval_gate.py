#!/usr/bin/env python3
"""Release gate — evaluate the brain over the gold set and fail on any breach.

    python3 synthesis/eval_gate.py

Runs the pipeline (offline stub backend) over every gold question, scores each
report against the grounding/faithfulness gates, prints a summary, and exits
non-zero if any report fails. Wire this into CI as a hard blocker for the Brain.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from corpus_brain.eval import evaluate_report  # noqa: E402
from corpus_brain.eval.gold import GOLD, run_case  # noqa: E402


def main() -> int:
    all_passed = True
    print(f"{'case':<14} {'pass':<5} {'grounding':<10} {'halluc':<7} {'claimRefs':<10} {'refs':<5}")
    print("-" * 56)
    for case in GOLD:
        report = run_case(case)
        m = evaluate_report(report)
        all_passed = all_passed and m["passed"]
        print(
            f"{case['id']:<14} {('YES' if m['passed'] else 'NO'):<5} "
            f"{m['groundingRate']:<10} {m['hallucinatedCitations']:<7} "
            f"{m['unresolvedClaimRefs']:<10} {m['references']:<5}"
        )
    print("-" * 56)
    print("GATE:", "PASS" if all_passed else "FAIL")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
