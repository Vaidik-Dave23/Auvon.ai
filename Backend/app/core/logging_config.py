"""
Structured JSON logging for Auvon.ai.

Replaces scattered `print(...)` calls with structured, machine-parseable
log lines. Every log line automatically includes request_id / user_id /
endpoint when called from inside a request, because those are bound to
structlog's contextvars by RequestContextMiddleware (see middleware.py).

Usage elsewhere in the codebase:

    from app.core.logging_config import get_logger
    log = get_logger(__name__)

    log.info("gemini_key_failed", model=model, key_suffix=key[-4:], error=str(e))

This produces one JSON object per line, e.g.:

    {"event": "gemini_key_failed", "model": "gemini-3.5-flash", "key_suffix": "a1b2",
     "error": "...", "request_id": "8f2c...", "user_id": 42, "endpoint": "/notes/query",
     "level": "warning", "timestamp": "2026-07-14T05:12:03.221Z"}
"""

import logging
import os
import sys

import structlog

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# Pretty console output locally, pure JSON in anything that looks like prod.
_USE_JSON = ENVIRONMENT != "development"


def configure_logging() -> None:
    """Call once, at process startup (from main.py)."""
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=LOG_LEVEL,
    )

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    structlog.configure(
        processors=shared_processors
        + [structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    renderer = (
        structlog.processors.JSONRenderer()
        if _USE_JSON
        else structlog.dev.ConsoleRenderer(colors=True)
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(LOG_LEVEL)

    # Quiet down noisy third-party loggers.
    for noisy in ("uvicorn.access", "httpx", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str = __name__):
    return structlog.get_logger(name)
