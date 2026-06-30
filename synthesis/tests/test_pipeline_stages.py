"""Stage-level tests: screen, extract, grade."""
from corpus_brain.pipeline import extract as extract_stage
from corpus_brain.pipeline import grade as grade_stage
from corpus_brain.pipeline import screen as screen_stage
from corpus_brain.pipeline.extract import EFFECT_DIRECTIONS, STANCES, STUDY_DESIGNS


def test_screen_funnel_is_monotonic(question, papers, llm):
    out = screen_stage.screen(question, papers, corpus_size=5_000_000, llm=llm)
    counts = [s["count"] for s in out.funnel_stages]
    assert len(counts) == 4
    assert counts == sorted(counts, reverse=True)  # retrieved >= relevant >= candidates >= included
    assert out.funnel_stages[0]["count"] >= len(papers)
    assert len(out.included) <= len(papers)
    assert all(p in papers for p in out.included)


def test_screen_empty_corpus(question, llm):
    out = screen_stage.screen(question, [], corpus_size=0, llm=llm)
    assert out.included == []
    assert out.funnel_stages[-1]["count"] == 0


def test_extraction_is_schema_valid(question, papers, llm):
    out = screen_stage.screen(question, papers, 5_000_000, llm)
    extractions = extract_stage.extract(question, out.included, llm)
    assert len(extractions) == len(out.included)
    for i, e in enumerate(extractions):
        assert e.ref_id == f"r{i + 1}" and e.number == i + 1
        assert e.study_design in STUDY_DESIGNS
        assert e.effect_direction in EFFECT_DIRECTIONS
        assert e.stance in STANCES
        assert e.sample_size >= 0


def test_grade_aggregates_stances_and_grounds_claims(question, papers, llm):
    out = screen_stage.screen(question, papers, 5_000_000, llm)
    extractions = extract_stage.extract(question, out.included, llm)
    g = grade_stage.grade(out.included, extractions)

    assert g.consensus_strength in ("strong", "moderate", "mixed", "emerging")
    assert sum(b["count"] for b in g.meter_buckets) == len(extractions)
    assert all(r["grade"] in ("strong", "moderate", "weak", "emerging") for r in g.matrix_rows)

    ref_ids = {e.ref_id for e in extractions}
    for claim in g.claims_rows:
        assert set(claim["refIds"]).issubset(ref_ids)  # every claim ref is real
    assert g.timeline_axis[0] <= g.timeline_axis[1]
