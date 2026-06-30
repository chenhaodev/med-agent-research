from corpus_brain import contract


def test_event_constructors_shape():
    assert contract.status("screening", 0.2, "msg") == {
        "event": "status",
        "data": {"phase": "screening", "progress": 0.2, "message": "msg"},
    }
    assert contract.funnel([{"stage": "x", "label": "X", "count": 1}])["event"] == "funnel"
    assert contract.meter("q", 3, [])["data"]["n"] == 3
    assert contract.block_event({"type": "heading"})["data"]["block"]["type"] == "heading"
    assert contract.references_event([{"id": "r1"}])["data"]["added"][0]["id"] == "r1"
    assert contract.done({"id": "rep"})["data"]["report"]["id"] == "rep"
    assert contract.error("c", "m") == {"event": "error", "data": {"code": "c", "message": "m"}}


def test_block_builders():
    h = contract.heading(2, "Results", "3")
    assert h == {"type": "heading", "level": 2, "text": "Results", "number": "3"}
    assert "number" not in contract.heading(3, "Open questions")

    p = contract.prose("body{{cite:1}}", [contract.citation("r1", 1, "yes", "tip")])
    assert p["type"] == "prose"
    assert p["citations"][0] == {"refId": "r1", "number": 1, "stance": "yes", "tooltip": "tip"}

    m = contract.consensus_meter("q", 5, [{"stance": "yes", "count": 5}], caption="Fig")
    assert m["type"] == "consensusMeter" and m["caption"] == "Fig"
