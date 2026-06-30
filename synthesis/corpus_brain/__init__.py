"""Corpus synthesis brain — the medical research-synthesis engine.

A standalone worker that turns a ResearchQuery + a candidate corpus into a
SynthesisReport, speaking the same event contract as the mock pipeline
(server/src/pipeline/stream.ts). It emits ReportEvents as newline-delimited
JSON so the Node API gateway can relay them over SSE unchanged.
"""

__all__ = ["__version__"]
__version__ = "0.1.0"
