"""OpenTelemetry GenAI tracing for the kwale cortical scoring pipeline.

Design goals
------------
- **Safe no-op when unconfigured.** If ``OTEL_EXPORTER_OTLP_ENDPOINT`` is not
  set, ``setup_tracing`` installs nothing and ``stage_span`` yields a no-op
  span. Nothing here may ever raise into the request/worker path.
- **OTLP export.** When the endpoint env var is present we install an OTLP
  span exporter (gRPC) behind a ``BatchSpanProcessor`` with a resource whose
  ``service.name`` is ``kwale-cortical-api`` (overridable via
  ``OTEL_SERVICE_NAME``).
- **GenAI semantic conventions.** Span attributes use the OTel GenAI names
  (``gen_ai.operation.name``, ``gen_ai.system``, ``gen_ai.request.model``)
  where they apply, alongside pipeline-specific keys (``pipeline.stage``,
  ``job.id``).

The exporter/provider can also be installed explicitly (e.g. tests wiring an
in-memory exporter) via :func:`install_tracer_provider`.
"""

from __future__ import annotations

import contextlib
import logging
import os
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

from opentelemetry import trace
from opentelemetry.trace import Span, Status, StatusCode

if TYPE_CHECKING:  # pragma: no cover - typing only
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

# ── constants ────────────────────────────────────────────────────────────────

SERVICE_NAME = "kwale-cortical-api"
GEN_AI_SYSTEM = "kwale.cortical"
INSTRUMENTATION_SCOPE = "backend.observability.tracing"

# GenAI semantic-convention attribute keys (kept as named constants so callers
# don't sprinkle magic strings — per repo code-quality standards).
ATTR_GEN_AI_OPERATION = "gen_ai.operation.name"
ATTR_GEN_AI_SYSTEM = "gen_ai.system"
ATTR_GEN_AI_REQUEST_MODEL = "gen_ai.request.model"
ATTR_PIPELINE_STAGE = "pipeline.stage"
ATTR_JOB_ID = "job.id"
ATTR_DURATION_SECONDS = "duration.seconds"

# Set once ``install_tracer_provider`` has wired a real (non default-API)
# provider, so ``stage_span`` knows tracing is live.
_TRACING_ENABLED = False


# ── env helpers ──────────────────────────────────────────────────────────────


def _otlp_endpoint() -> str | None:
    """Live-read the OTLP endpoint env var. Empty/unset => tracing disabled."""
    val = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    return val or None


def _service_name() -> str:
    return os.getenv("OTEL_SERVICE_NAME", "").strip() or SERVICE_NAME


def is_enabled() -> bool:
    """True once a real tracer provider has been installed."""
    return _TRACING_ENABLED


# ── provider wiring ──────────────────────────────────────────────────────────


def install_tracer_provider(span_processor: Any | None = None) -> bool:
    """Install a real OTel ``TracerProvider`` with ``service.name`` set.

    - If ``span_processor`` is given (e.g. an in-memory processor in tests) it
      is attached directly and the OTLP env requirement is bypassed.
    - Otherwise an OTLP exporter is installed only if
      ``OTEL_EXPORTER_OTLP_ENDPOINT`` is set; if unset this is a no-op and
      returns ``False`` (tracing stays disabled).

    Never raises — exporter/import failures degrade to a no-op.
    """
    global _TRACING_ENABLED

    if span_processor is None and _otlp_endpoint() is None:
        # Unconfigured: deliberate no-op. The default API tracer returns
        # non-recording spans, so callers stay safe.
        return False

    try:
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create({"service.name": _service_name()})
        provider = TracerProvider(resource=resource)

        if span_processor is not None:
            provider.add_span_processor(span_processor)
        else:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
                OTLPSpanExporter,
            )

            exporter = OTLPSpanExporter(endpoint=_otlp_endpoint())
            provider.add_span_processor(BatchSpanProcessor(exporter))

        trace.set_tracer_provider(provider)
        _TRACING_ENABLED = True
        logger.info(
            "OTel tracing enabled (service.name=%s, endpoint=%s)",
            _service_name(),
            _otlp_endpoint() if span_processor is None else "<in-memory>",
        )
        return True
    except Exception as exc:  # pragma: no cover - defensive; never crash app
        logger.warning("OTel tracing setup failed (continuing without): %s", exc)
        _TRACING_ENABLED = False
        return False


def setup_tracing(app: FastAPI | None = None) -> bool:
    """Entry point for app startup.

    Installs the OTLP tracer provider when ``OTEL_EXPORTER_OTLP_ENDPOINT`` is
    configured, then (best-effort) instruments the FastAPI ``app`` if one is
    passed. Returns whether tracing ended up enabled.

    Safe no-op + never raises when the endpoint env is unset.
    """
    enabled = install_tracer_provider()
    if enabled and app is not None:
        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

            FastAPIInstrumentor.instrument_app(app)
        except Exception as exc:  # pragma: no cover - optional dependency
            # FastAPI auto-instrumentation is a bonus; manual spans still work.
            logger.debug("FastAPI auto-instrumentation unavailable: %s", exc)
    return enabled


def get_tracer():
    """Return the GenAI tracer for this service.

    Falls back to the OTel default (no-op) tracer when tracing is unconfigured,
    so callers never need to null-check.
    """
    return trace.get_tracer(INSTRUMENTATION_SCOPE)


# ── span helpers ─────────────────────────────────────────────────────────────


def _apply_common_attrs(span: Span, *, stage: str, job_id: str | None, model: str | None) -> None:
    if not span.is_recording():
        return
    span.set_attribute(ATTR_GEN_AI_OPERATION, stage)
    span.set_attribute(ATTR_GEN_AI_SYSTEM, GEN_AI_SYSTEM)
    span.set_attribute(ATTR_PIPELINE_STAGE, stage)
    if job_id is not None:
        span.set_attribute(ATTR_JOB_ID, str(job_id))
    if model is not None:
        span.set_attribute(ATTR_GEN_AI_REQUEST_MODEL, model)


@contextmanager
def stage_span(
    stage: str,
    *,
    job_id: str | None = None,
    model: str | None = None,
    attributes: dict[str, Any] | None = None,
) -> Iterator[Span]:
    """Wrap a pipeline stage in a span.

    Records GenAI semantic-convention attributes (``gen_ai.operation.name``,
    ``gen_ai.system`` and, when supplied, ``gen_ai.request.model``) plus the
    pipeline stage name, ``job.id`` and the measured ``duration.seconds``. On
    exception the span is marked ``ERROR`` and the exception is recorded, then
    re-raised so existing error handling is unchanged.

    Always safe: if tracing is disabled the underlying tracer yields a
    non-recording span and this becomes near-zero overhead.

    Usage::

        with stage_span("ingest", job_id=job_id):
            media, events = ingest(url, work_dir)
    """
    tracer = get_tracer()
    start = time.perf_counter()
    with tracer.start_as_current_span(f"pipeline.{stage}") as span:
        _apply_common_attrs(span, stage=stage, job_id=job_id, model=model)
        if attributes:
            for k, v in attributes.items():
                with contextlib.suppress(Exception):  # bad attr value — ignore
                    span.set_attribute(k, v)
        try:
            yield span
        except Exception as exc:
            if span.is_recording():
                span.set_attribute(ATTR_DURATION_SECONDS, time.perf_counter() - start)
                span.record_exception(exc)
                span.set_status(Status(StatusCode.ERROR, str(exc)))
            raise
        else:
            if span.is_recording():
                span.set_attribute(ATTR_DURATION_SECONDS, time.perf_counter() - start)
                span.set_status(Status(StatusCode.OK))
