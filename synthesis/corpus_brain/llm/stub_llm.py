"""Deterministic, offline LLM backend.

A stand-in for Claude used in tests, CI, and no-API-key dev. It produces
schema-valid, *stable* output (seeded from the prompt) so the whole pipeline
runs end-to-end without a network — the structure is real even though the
judgments are simulated. Semantic quality is what the eval harness measures
against the real backend; the stub only guarantees shape and determinism.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

from .base import LLMClient, ModelTier


def _seed(text: str) -> int:
    return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:12], 16)


def _unit(seed: int, salt: str) -> float:
    """A stable float in [0, 1) derived from seed + salt."""
    h = int(hashlib.sha256(f"{seed}:{salt}".encode("utf-8")).hexdigest()[:12], 16)
    return (h % 100_000) / 100_000.0


def _estimate(*parts: str) -> int:
    return max(1, sum(len(p) for p in parts) // 4)


class StubLLM(LLMClient):
    def _structured(
        self, tier: ModelTier, system: str, user: str, schema: dict
    ) -> tuple[dict, int, int]:
        seed = _seed(user)
        props: dict[str, Any] = schema.get("properties", {})
        out: dict[str, Any] = {}
        for name, spec in props.items():
            out[name] = self._value_for(name, spec, seed)
        return out, _estimate(system, user), _estimate(str(out))

    def _value_for(self, name: str, spec: dict, seed: int) -> Any:
        t = spec.get("type")
        if "enum" in spec:
            choices = spec["enum"]
            return choices[int(_unit(seed, name) * len(choices)) % len(choices)]
        if t == "boolean":
            return _unit(seed, name) >= 0.4  # bias toward inclusion for a realistic funnel
        if t in ("number", "integer"):
            lo = spec.get("minimum", 0)
            hi = spec.get("maximum", 1 if t == "number" else 500)
            val = lo + _unit(seed, name) * (hi - lo)
            return round(val, 3) if t == "number" else int(val)
        if t == "array":
            return []
        # string
        return spec.get("x-stub", f"stub-{name}-{seed % 1000}")

    def _text(self, tier: ModelTier, system: str, user: str) -> tuple[str, int, int]:
        seed = _seed(user)
        topic = _extract_line(user, "TOPIC:") or "this area"
        section = _extract_line(user, "SECTION:") or "the evidence"
        cites = _extract_cites(user)

        sentences = [
            f"The evidence on {topic} converges on a consistent direction across the included studies",
            "though effect sizes vary by setting and follow-up horizon",
            "with the strongest signals in structured, repeatable outcomes",
        ]
        # Rotate sentence order deterministically for variety across sections.
        rot = int(_unit(seed, "rot") * len(sentences))
        sentences = sentences[rot:] + sentences[:rot]
        body = ". ".join(sentences) + "."

        # Attach the allowed citation tokens so the grounding guardrail can verify them.
        if cites:
            anchored = ""
            for i, n in enumerate(cites[:3]):
                anchored += f" {sentences[i % len(sentences)]}{{{{cite:{n}}}}}."
            body = (f"In {section}, " + anchored.strip())
        return body, _estimate(system, user), _estimate(body)


def _extract_line(text: str, prefix: str) -> str | None:
    for line in text.splitlines():
        line = line.strip()
        if line.startswith(prefix):
            return line[len(prefix):].strip()
    return None


def _extract_cites(text: str) -> list[int]:
    line = _extract_line(text, "CITE_REFS:")
    if not line:
        return []
    return [int(n) for n in re.findall(r"\d+", line)]
