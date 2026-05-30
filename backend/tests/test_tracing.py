"""Tests for OTel GenAI tracing helpers.

Uses an in-memory span exporter (no network) to assert that ``stage_span``
emits spans with the expected GenAI semantic-convention attributes and
records error status on exceptions. Also verifies the unconfigured no-op path.
"""

from __future__ import annotations

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)

# Imported AFTER conftest.py pins env. tracing has no DB dependency.
from backend.observability import tracing
from backend.observability.tracing import stage_span


@pytest.fixture
def memory_exporter() -> InMemorySpanExporter:
    """Yield a per-test in-memory exporter.

    OTel forbids overriding a ``TracerProvider`` once one is set globally, so
    we install a single provider for the whole module (idempotent) and attach
    a fresh ``SimpleSpanProcessor`` per test, shutting it down afterward. This
    keeps each test's spans isolated without fighting the global provider.
    """
    from opentelemetry import trace

    provider = trace.get_tracer_provider()
    if not isinstance(provider, TracerProvider):
        provider = TracerProvider()
        trace.set_tracer_provider(provider)
    tracing._TRACING_ENABLED = True

    exporter = InMemorySpanExporter()
    processor = SimpleSpanProcessor(exporter)
    provider.add_span_processor(processor)
    try:
        yield exporter
    finally:
        processor.shutdown()
        exporter.clear()


def test_stage_span_emits_span_with_genai_attrs(memory_exporter):
    with stage_span("infer", job_id="job-123", model="facebook/tribev2"):
        pass

    spans = memory_exporter.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    assert span.name == "pipeline.infer"
    attrs = dict(span.attributes)
    assert attrs["gen_ai.operation.name"] == "infer"
    assert attrs["gen_ai.system"] == "kwale.cortical"
    assert attrs["gen_ai.request.model"] == "facebook/tribev2"
    assert attrs["pipeline.stage"] == "infer"
    assert attrs["job.id"] == "job-123"
    assert "duration.seconds" in attrs
    assert attrs["duration.seconds"] >= 0
    # OK status on clean exit.
    assert span.status.status_code.name == "OK"


def test_stage_span_records_error_on_exception(memory_exporter):
    with pytest.raises(ValueError), stage_span("ingest", job_id="job-err"):
        raise ValueError("boom")

    spans = memory_exporter.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    assert span.name == "pipeline.ingest"
    assert span.status.status_code.name == "ERROR"
    # The exception is recorded as a span event.
    assert any(e.name == "exception" for e in span.events)


def test_all_five_stages_emit(memory_exporter):
    for stage in ("ingest", "infer", "metrics", "score", "fuse"):
        with stage_span(stage, job_id="job-pipe"):
            pass

    spans = memory_exporter.get_finished_spans()
    names = {s.name for s in spans}
    assert names == {
        "pipeline.ingest",
        "pipeline.infer",
        "pipeline.metrics",
        "pipeline.score",
        "pipeline.fuse",
    }


def test_noop_when_unconfigured(monkeypatch):
    """No OTLP endpoint + no processor => install is a no-op, span never crashes."""
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    enabled = tracing.install_tracer_provider()
    assert enabled is False
    # stage_span must still work (non-recording span, no exception).
    with stage_span("ingest", job_id="x") as span:
        assert span is not None
