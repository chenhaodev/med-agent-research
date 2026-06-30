#!/usr/bin/env python3
"""Worker entrypoint — read a job spec, emit ReportEvents as newline-delimited JSON.

Usage (driven by the Node gateway, but runnable by hand):

    echo '{"reportId":"rep_x","query":{"question":"mobile health","mode":"keyword","filters":{}},"papers":[...]}' \
        | python3 synthesis/run.py

Job spec fields: reportId, query, papers[], corpusSize?, maxTokens?, now?.
Each emitted line is one {"event": ..., "data": ...} object matching /api/types.ts.
Set CORPUS_BRAIN_STUB=1 to force the offline deterministic backend; otherwise the
real Claude backend is used when ANTHROPIC_API_KEY is present.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from corpus_brain.budget import Budget  # noqa: E402
from corpus_brain.llm import make_client  # noqa: E402
from corpus_brain.pipeline import run_report  # noqa: E402


def _emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def main() -> int:
    raw = sys.stdin.read()
    try:
        job = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as exc:
        _emit({"event": "error", "data": {"code": "bad_job_spec", "message": str(exc)}})
        return 1

    max_tokens = job.get("maxTokens") or (
        int(os.environ["CORPUS_BRAIN_MAX_TOKENS"]) if os.environ.get("CORPUS_BRAIN_MAX_TOKENS") else None
    )
    budget = Budget(max_tokens=max_tokens)
    force_stub = os.environ.get("CORPUS_BRAIN_STUB") == "1"
    llm = make_client(budget, force_stub=force_stub)

    saw_error = False
    for event in run_report(job, llm, budget):
        _emit(event)
        if event.get("event") == "error":
            saw_error = True
    return 1 if saw_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
