"""
OpenTelemetry tracing for Auvon.ai.

Gives you the "why did this request take 6 seconds" breakdown:

    POST /notes/{id}/query  (root span, from FastAPIInstrumentor)
      -> embedding_search        (manual span, notes.py)
           -> HTTP POST generativelanguage.googleapis.com  (auto, RequestsInstrumentor)
      -> retrieve_chunks         (manual span, notes.py)
           -> SELECT document_chunks ...                    (auto, SQLAlchemyInstrumentor)
      -> llm_generate             (manual span, ai.py)
           -> HTTP POST generativelanguage.googleapis.com  (auto, RequestsInstrumentor)

Exports via OTLP/HTTP to whatever OTEL_EXPORTER_OTLP_ENDPOINT points at —
Jaeger locally (see docker-compose.observability.yml), or any managed
backend (Grafana Tempo, Honeycomb, etc.) in production by changing one
env var, not code.

If OTEL_EXPORTER_OTLP_ENDPOINT is unset, spans are still created but
exported nowhere useful — fine for local dev without the observability
stack running, but set the env var to actually see traces.
"""

import os

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

SERVICE = os.getenv("OTEL_SERVICE_NAME", "auvon-backend")
OTLP_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")  # e.g. http://localhost:4318/v1/traces

_tracer_provider: TracerProvider | None = None


def setup_tracing(app, engine) -> None:
    """Call once from main.py, after the FastAPI app and DB engine exist."""
    global _tracer_provider

    resource = Resource.create({SERVICE_NAME: SERVICE})
    _tracer_provider = TracerProvider(resource=resource)

    if OTLP_ENDPOINT:
        exporter = OTLPSpanExporter(endpoint=OTLP_ENDPOINT)
        _tracer_provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(_tracer_provider)

    FastAPIInstrumentor.instrument_app(app)
    RequestsInstrumentor().instrument()
    SQLAlchemyInstrumentor().instrument(engine=engine, service=f"{SERVICE}-db")


def get_tracer(name: str):
    return trace.get_tracer(name)
