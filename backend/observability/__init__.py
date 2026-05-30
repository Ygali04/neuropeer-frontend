"""Observability — OpenTelemetry GenAI tracing for the cortical scoring pipeline."""

from backend.observability.tracing import get_tracer, setup_tracing, stage_span

__all__ = ["get_tracer", "setup_tracing", "stage_span"]
