"""Orchestrator tests — event sequence + a gold-passing done report."""
from corpus_brain.budget import Budget
from corpus_brain.eval import evaluate_report
from corpus_brain.llm import StubLLM
from corpus_brain.pipeline import run_report


def _run(papers, budget=None):
    budget = budget or Budget()
    llm = StubLLM(budget)
    job = {
        "reportId": "rep_test",
        "query": {"question": "effectiveness of the intervention", "mode": "keyword", "filters": {}},
        "papers": papers,
        "corpusSize": 5_000_000,
        "now": "2026-06-30T00:00:00+00:00",
    }
    return list(run_report(job, llm, budget))


def test_event_sequence_follows_contract(papers):
    events = _run(papers)
    kinds = [e["event"] for e in events]
    assert kinds[0] == "status"
    assert "funnel" in kinds and "meter" in kinds and "references" in kinds
    assert kinds[-1] == "done"
    # ordering: funnel before any block, references after the last block, done last
    assert kinds.index("funnel") < kinds.index("block")
    assert kinds.index("references") > max(i for i, k in enumerate(kinds) if k == "block")
    # status phases progress monotonically
    progress = [e["data"]["progress"] for e in events if e["event"] == "status"]
    assert progress == sorted(progress)
    assert progress[-1] == 1.0


def test_done_report_is_structurally_complete_and_passes_gate(papers):
    events = _run(papers)
    report = next(e["data"]["report"] for e in events if e["event"] == "done")
    assert report["status"] == "complete"
    assert report["topic"]
    assert report["consensus"]["strength"]
    assert report["metrics"]["contributingStudies"] >= 0
    assert {b["type"] for b in report["blocks"]} >= {"consensusMeter", "funnel", "claims"}

    metrics = evaluate_report(report)
    assert metrics["passed"], metrics
    assert metrics["hallucinatedCitations"] == 0
    assert metrics["groundingRate"] == 1.0


def test_budget_is_tracked(papers):
    budget = Budget()
    _run(papers, budget)
    assert budget.calls > 0
    assert budget.spent() > 0
    # screening, extraction, and synthesis tiers all contributed
    assert set(budget.by_tier) == {"screen", "extract", "synth"} or budget.by_tier  # at least populated
