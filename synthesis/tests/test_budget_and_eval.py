"""Budget accounting + eval-harness gate behavior."""
import pytest

from corpus_brain.budget import Budget, BudgetExceeded
from corpus_brain.eval import evaluate_report
from corpus_brain.eval.gold import GOLD, run_case
from corpus_brain.llm import ModelTier, StubLLM


def test_budget_records_and_caps():
    b = Budget(max_tokens=100)
    b.record("screen", 40, 10)
    assert b.spent() == 50 and b.calls == 1 and b.remaining() == 50
    b.record("synth", 40, 20)  # spent = 110 >= 100
    with pytest.raises(BudgetExceeded):
        b.check()


def test_llm_records_usage_into_budget():
    b = Budget()
    llm = StubLLM(b)
    llm.text(ModelTier.SYNTH, "sys", "TOPIC: x\nSECTION: y\nwrite")
    schema = {"type": "object", "additionalProperties": False, "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}
    out = llm.structured(ModelTier.SCREEN, "sys", "user", schema)
    assert isinstance(out["ok"], bool)
    assert b.calls == 2 and b.spent() > 0


def _good_report():
    return {
        "references": [{"id": "r1", "number": 1}, {"id": "r2", "number": 2}],
        "blocks": [
            {"type": "consensusMeter"},
            {"type": "funnel"},
            {"type": "prose", "html": "x{{cite:1}}", "citations": [{"refId": "r1", "number": 1}]},
            {"type": "claims", "rows": [{"refIds": ["r1", "r2"]}]},
        ],
    }


def test_eval_passes_a_grounded_report():
    m = evaluate_report(_good_report())
    assert m["passed"] and m["groundingRate"] == 1.0 and m["hallucinatedCitations"] == 0


def test_eval_detects_hallucinated_citation():
    report = _good_report()
    report["blocks"].append(
        {"type": "prose", "html": "fabricated{{cite:99}}", "citations": [{"refId": "r99", "number": 99}]}
    )
    m = evaluate_report(report)
    assert not m["passed"]
    assert m["hallucinatedCitations"] >= 1


def test_eval_detects_unresolved_claim_refs():
    report = _good_report()
    report["blocks"].append({"type": "claims", "rows": [{"refIds": ["r404"]}]})
    m = evaluate_report(report)
    assert not m["passed"] and m["unresolvedClaimRefs"] >= 1


def test_gold_set_all_pass_the_gate():
    for case in GOLD:
        report = run_case(case)
        m = evaluate_report(report)
        assert m["passed"], (case["id"], m)
