"""The synthesis pipeline: screen → extract → grade → synthesize."""
from __future__ import annotations

from .orchestrator import run_report

__all__ = ["run_report"]
