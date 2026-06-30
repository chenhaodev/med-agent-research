from __future__ import annotations

from typing import Any

import pytest

from corpus_brain.budget import Budget
from corpus_brain.llm import StubLLM


@pytest.fixture
def budget() -> Budget:
    return Budget()


@pytest.fixture
def llm(budget: Budget) -> StubLLM:
    return StubLLM(budget)


def make_paper(i: int, design: str = "rct", preprint: bool = False) -> dict[str, Any]:
    return {
        "id": f"p{i}",
        "title": f"Study {i} on the intervention",
        "abstract": f"A {design} reporting outcomes and effect estimates for study {i}.",
        "authors": [{"name": f"Author{i}, A."}, {"name": f"Coauthor{i}, B."}],
        "year": 2018 + (i % 7),
        "venue": {"name": "Journal of Evidence", "type": "preprint" if preprint else "journal", "quartile": "Q1"},
        "citationCount": 10 * i + 3,
        "isPreprint": preprint,
        "studyDesign": design,
        "externalIds": {"doi": f"10.1000/ev.{i}"},
        "url": f"https://example.org/p{i}",
    }


@pytest.fixture
def papers() -> list[dict[str, Any]]:
    designs = ["rct", "meta-analysis", "cohort", "review", "observational", "rct", "cohort", "review"]
    return [make_paper(i + 1, d, preprint=(i % 5 == 0)) for i, d in enumerate(designs)]


@pytest.fixture
def question() -> str:
    return "effectiveness of the intervention on the primary outcome"
