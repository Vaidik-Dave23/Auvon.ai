"""
OpenTelemetry tracing for Auvon.ai.
"""

import os
import socket
from urllib.parse import urlparse

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from app.core.logging_config import get_logger

log = get_logger(__name__)

SERVICE = os.getenv("OTEL_SERVICE_NAME", "auvon-backend")
OTLP_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")  # e.g. http://localhost:4318/v1/traces

_tracer_provider: TracerProvider | None = None


def _is_collector_reachable(endpoint: str) -> bool:
    """Fast probe to determine if the OTLP collector is listening on the target port."""
    try:
        parsed = urlparse(endpoint)
        host = parsed.hostname or "localhost"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        with socket.create_connection((host, port), timeout=0.2):
            return True
    except Exception:
        return False


def setup_tracing(app, engine=None) -> None:
    """Call once from main.py, after the FastAPI app exists."""
    global _tracer_provider

    resource = Resource.create({SERVICE_NAME: SERVICE})
    _tracer_provider = TracerProvider(resource=resource)

    if OTLP_ENDPOINT:
        if _is_collector_reachable(OTLP_ENDPOINT):
            exporter = OTLPSpanExporter(endpoint=OTLP_ENDPOINT)
            _tracer_provider.add_span_processor(BatchSpanProcessor(exporter))
            log.info("otel_tracing_exporter_active", endpoint=OTLP_ENDPOINT)
        else:
            log.info(
                "otel_collector_offline",
                endpoint=OTLP_ENDPOINT,
                note="Collector not reachable on port 4318. Trace batch exporting paused until collector is started.",
            )

    trace.set_tracer_provider(_tracer_provider)

    FastAPIInstrumentor.instrument_app(app)
    RequestsInstrumentor().instrument(excluded_urls=r".*4318.*")
    if engine is not None:
        try:
            from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
            SQLAlchemyInstrumentor().instrument(engine=engine, service=f"{SERVICE}-db")
        except Exception:
            pass


def get_tracer(name: str):
    return trace.get_tracer(name)
