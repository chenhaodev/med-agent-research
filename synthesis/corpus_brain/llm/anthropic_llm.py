"""Real Claude backend — model-tiered, with structured outputs and prompt caching.

Tiers map to models per the roadmap's cost strategy: Haiku screens, Sonnet
extracts, Opus synthesizes. Structured calls use `output_config.format`
(json_schema) so extraction is schema-validated. The system prompt is cached
(`cache_control`) because screening/extraction reuse the same instructions across
hundreds of per-paper calls.

API shapes confirmed against the claude-api skill (2026-06): adaptive thinking
on Sonnet/Opus, effort on the synthesis tier, no thinking/effort on Haiku.
"""
from __future__ import annotations

import json
from typing import Any

from .base import DEFAULT_MODELS, LLMClient, ModelTier

# Per-tier generation caps (kept under non-streaming SDK timeouts).
MAX_TOKENS: dict[ModelTier, int] = {
    ModelTier.SCREEN: 512,
    ModelTier.EXTRACT: 1500,
    ModelTier.SYNTH: 4096,
}


def _system_blocks(system: str) -> list[dict[str, Any]]:
    """Cache the (stable) system prompt so repeated per-paper calls hit the cache."""
    return [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]


def _thinking_for(tier: ModelTier) -> dict[str, Any] | None:
    # Haiku 4.5 rejects thinking/effort; Sonnet/Opus use adaptive thinking.
    if tier == ModelTier.SCREEN:
        return None
    return {"type": "adaptive"}


def _usage(resp: Any) -> tuple[int, int]:
    u = resp.usage
    in_t = (
        getattr(u, "input_tokens", 0)
        + getattr(u, "cache_read_input_tokens", 0)
        + getattr(u, "cache_creation_input_tokens", 0)
    )
    return in_t, getattr(u, "output_tokens", 0)


def _first_text(resp: Any) -> str:
    for block in resp.content:
        if getattr(block, "type", None) == "text":
            return block.text
    return ""


class AnthropicLLM(LLMClient):
    def __init__(self, budget: Any) -> None:
        super().__init__(budget)
        import anthropic  # lazy: only needed for the real backend

        self._client = anthropic.Anthropic()

    def _common(self, tier: ModelTier, system: str, user: str) -> dict[str, Any]:
        params: dict[str, Any] = {
            "model": DEFAULT_MODELS[tier],
            "max_tokens": MAX_TOKENS[tier],
            "system": _system_blocks(system),
            "messages": [{"role": "user", "content": user}],
        }
        thinking = _thinking_for(tier)
        if thinking is not None:
            params["thinking"] = thinking
            if tier == ModelTier.SYNTH:
                params["output_config"] = {"effort": "high"}
        return params

    def _structured(
        self, tier: ModelTier, system: str, user: str, schema: dict
    ) -> tuple[dict, int, int]:
        params = self._common(tier, system, user)
        fmt = {"format": {"type": "json_schema", "schema": schema}}
        # Merge with any effort already set on output_config.
        params["output_config"] = {**params.get("output_config", {}), **fmt}
        resp = self._client.messages.create(**params)
        in_t, out_t = _usage(resp)
        text = _first_text(resp)
        try:
            value = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"structured output was not valid JSON: {exc}") from exc
        return value, in_t, out_t

    def _text(self, tier: ModelTier, system: str, user: str) -> tuple[str, int, int]:
        resp = self._client.messages.create(**self._common(tier, system, user))
        in_t, out_t = _usage(resp)
        return _first_text(resp), in_t, out_t
