"""The LLM interface the pipeline depends on, plus model tiering.

Model strategy (per the roadmap): Haiku for high-volume screening, Sonnet for
per-paper extraction, Opus for synthesis. Backends translate a ModelTier into a
concrete model id and record token usage into the shared Budget.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum

from ..budget import Budget


class ModelTier(str, Enum):
    SCREEN = "screen"
    EXTRACT = "extract"
    SYNTH = "synth"


# Model ids per tier (confirmed against the claude-api skill, 2026-06).
DEFAULT_MODELS: dict[ModelTier, str] = {
    ModelTier.SCREEN: "claude-haiku-4-5",
    ModelTier.EXTRACT: "claude-sonnet-4-6",
    ModelTier.SYNTH: "claude-opus-4-8",
}


class LLMClient(ABC):
    """Records usage centrally so every backend feeds the same Budget. Subclasses
    implement the two raw calls and return (value, input_tokens, output_tokens)."""

    def __init__(self, budget: Budget) -> None:
        self.budget = budget

    def structured(self, tier: ModelTier, system: str, user: str, schema: dict) -> dict:
        self.budget.check()
        value, in_t, out_t = self._structured(tier, system, user, schema)
        self.budget.record(tier.value, in_t, out_t)
        return value

    def text(self, tier: ModelTier, system: str, user: str) -> str:
        self.budget.check()
        value, in_t, out_t = self._text(tier, system, user)
        self.budget.record(tier.value, in_t, out_t)
        return value

    # --- raw backend calls ---

    @abstractmethod
    def _structured(
        self, tier: ModelTier, system: str, user: str, schema: dict
    ) -> tuple[dict, int, int]:
        raise NotImplementedError

    @abstractmethod
    def _text(self, tier: ModelTier, system: str, user: str) -> tuple[str, int, int]:
        raise NotImplementedError
