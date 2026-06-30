"""Per-report cost & latency budget.

A medical synthesis run fans out many LLM calls (one screen per paper, one
extraction per included paper, several synthesis calls). The budget caps total
token spend so a single report can't run away, and records usage so the worker
can report cost/latency back to the gateway.
"""
from __future__ import annotations

from dataclasses import dataclass, field


class BudgetExceeded(RuntimeError):
    """Raised when a report's token budget is exhausted mid-run."""


@dataclass
class Budget:
    """Tracks token spend for one report. `max_tokens` is a hard ceiling on
    input+output across all LLM calls; None means unbounded (dev/stub)."""

    max_tokens: int | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    calls: int = 0
    by_tier: dict[str, int] = field(default_factory=dict)

    def record(self, tier: str, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens += max(0, input_tokens)
        self.output_tokens += max(0, output_tokens)
        self.calls += 1
        self.by_tier[tier] = self.by_tier.get(tier, 0) + max(0, input_tokens) + max(0, output_tokens)

    def spent(self) -> int:
        return self.input_tokens + self.output_tokens

    def remaining(self) -> float:
        return float("inf") if self.max_tokens is None else max(0, self.max_tokens - self.spent())

    def check(self) -> None:
        """Raise once the ceiling is reached, so the caller can stop cleanly."""
        if self.max_tokens is not None and self.spent() >= self.max_tokens:
            raise BudgetExceeded(f"token budget exhausted: {self.spent()}/{self.max_tokens}")

    def summary(self) -> dict[str, object]:
        return {
            "calls": self.calls,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "totalTokens": self.spent(),
            "maxTokens": self.max_tokens,
            "byTier": dict(self.by_tier),
        }
