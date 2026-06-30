"""LLM backends for the synthesis brain.

The pipeline depends only on the LLMClient interface (base.py). Two backends
implement it: AnthropicLLM (real Claude, model-tiered) and StubLLM
(deterministic, offline — for tests, CI, and no-API-key dev). The factory
`make_client` picks AnthropicLLM when ANTHROPIC_API_KEY is set, else StubLLM.
"""
from __future__ import annotations

import os

from ..budget import Budget
from .base import LLMClient, ModelTier
from .stub_llm import StubLLM

__all__ = ["LLMClient", "ModelTier", "StubLLM", "make_client"]


def make_client(budget: Budget, *, force_stub: bool = False) -> LLMClient:
    """Real Claude when ANTHROPIC_API_KEY is present (and not forced to stub),
    otherwise the deterministic offline stub."""
    if not force_stub and os.environ.get("ANTHROPIC_API_KEY"):
        from .anthropic_llm import AnthropicLLM  # lazy: anthropic is optional

        return AnthropicLLM(budget)
    return StubLLM(budget)
