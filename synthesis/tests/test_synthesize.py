"""Synthesis tests — the citation-grounding guardrail is the safety spine."""
from corpus_brain.pipeline import extract as extract_stage
from corpus_brain.pipeline import grade as grade_stage
from corpus_brain.pipeline import screen as screen_stage
from corpus_brain.pipeline import synthesize as synth_stage


def test_ground_prose_strips_ungrounded_citations():
    html = "A claim{{cite:1}} and a fabricated one{{cite:99}}."
    citations = [
        {"refId": "r1", "number": 1, "stance": "yes", "tooltip": ""},
        {"refId": "r99", "number": 99, "stance": "yes", "tooltip": ""},
    ]
    clean, kept, dropped = synth_stage.ground_prose(html, citations, valid_numbers={1})
    assert "{{cite:99}}" not in clean
    assert "{{cite:1}}" in clean
    assert [c["number"] for c in kept] == [1]
    assert dropped == 2  # one entry + one token


def test_ground_prose_keeps_fully_grounded():
    html = "x{{cite:2}}"
    citations = [{"refId": "r2", "number": 2, "stance": "possibly", "tooltip": ""}]
    clean, kept, dropped = synth_stage.ground_prose(html, citations, valid_numbers={1, 2, 3})
    assert clean == html and len(kept) == 1 and dropped == 0


def test_build_references_maps_types(question, papers, llm):
    out = screen_stage.screen(question, papers, 5_000_000, llm)
    extractions = extract_stage.extract(question, out.included, llm)
    refs = synth_stage.build_references(out.included, extractions)
    assert [r["number"] for r in refs] == list(range(1, len(refs) + 1))
    assert all(r["type"] in ("journal-article", "preprint", "review", "meta-analysis") for r in refs)


def test_synthesize_emits_grounded_report(question, papers, llm):
    out = screen_stage.screen(question, papers, 5_000_000, llm)
    extractions = extract_stage.extract(question, out.included, llm)
    g = grade_stage.grade(out.included, extractions)
    blocks, refs, reading_time, grounding = synth_stage.synthesize(
        question, out.included, extractions, g, out.funnel_stages, llm
    )
    types = {b["type"] for b in blocks}
    assert {"tldr", "consensusMeter", "funnel", "evidenceMatrix", "claims", "timeline", "openQuestions"} <= types
    assert len(refs) >= 1
    assert reading_time >= 3
    assert grounding["dropped"] == 0  # the stub only cites provided refs
