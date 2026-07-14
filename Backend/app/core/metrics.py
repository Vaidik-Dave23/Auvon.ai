"""
Prometheus metrics for Auvon.ai.

Standard HTTP metrics (requests_total, request duration, in-progress
requests) come for free from prometheus-fastapi-instrumentator — see
setup_metrics() below, wired into main.py.

The metrics defined here are the AI-pipeline-specific ones the generic
instrumentator can't know about: LLM call latency broken down by which
provider/model actually served the request (this is the number that
matters once you have Gemini -> Gemini fallback -> OpenAI cascading),
embedding latency, and error counts by endpoint.

NOTE on cache_hits_total: Auvon.ai does not currently have a caching
layer in front of the LLM or embedding calls, so this counter is wired
up but will stay at zero. It's here so that if/when a cache is added
(e.g. caching embeddings for identical chunk text) it's a one-line
`CACHE_HITS.labels(cache="embedding").inc()` instead of a new metrics
PR. Flagging this so it's not read as a claim that caching exists.
"""

from prometheus_client import Counter, Histogram

LLM_LATENCY = Histogram(
    "llm_latency_seconds",
    "Time spent waiting on an LLM provider call, per provider/model.",
    labelnames=["provider", "model", "endpoint"],
    buckets=(0.25, 0.5, 1, 2, 3, 5, 8, 13, 21, 34, 60),
)

LLM_CALLS = Counter(
    "llm_calls_total",
    "Total LLM calls attempted, labelled by provider/model and outcome.",
    labelnames=["provider", "model", "endpoint", "outcome"],  # outcome: success|error
)

LLM_TOKENS = Counter(
    "llm_tokens_total",
    "Total tokens consumed, labelled by provider/model and token type.",
    labelnames=["provider", "model", "token_type"],  # token_type: prompt|completion
)

EMBEDDING_LATENCY = Histogram(
    "embedding_latency_seconds",
    "Time spent generating a single embedding.",
    labelnames=["task_type"],  # RETRIEVAL_DOCUMENT|RETRIEVAL_QUERY
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5),
)

CACHE_HITS = Counter(
    "cache_hits_total",
    "Cache hits. Currently unused — no caching layer exists yet (see module docstring).",
    labelnames=["cache"],
)

API_ERRORS = Counter(
    "api_errors_total",
    "Unhandled exceptions per endpoint (5xx responses).",
    labelnames=["endpoint"],
)


def setup_metrics(app):
    """Attach /metrics endpoint with standard HTTP metrics. Call once from main.py."""
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/metrics", "/health"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
