"""
RequestContextMiddleware

One middleware, three jobs:
  1. Generate/propagate a request_id (X-Request-ID header in/out).
  2. Best-effort decode the JWT to get user_id, bind both to structlog
     contextvars so every log line inside this request carries them
     without threading them through every function call.
  3. Emit exactly one structured JSON "request_completed" log line per
     request with endpoint, status, latency_ms — this is what the
     resume line "structured logging for all inference requests" refers to.

This runs before FastAPI resolves route dependencies, so user_id is
extracted here directly from the Authorization header rather than via
get_current_user (which requires a DB hit we don't want on every request
just for logging).
"""

import os
import time
import uuid

from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

import structlog

from app.core.logging_config import get_logger
from app.core.metrics import API_ERRORS

log = get_logger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")


def _extract_user_id(request: Request) -> int | None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("id")
    except JWTError:
        return None


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        user_id = _extract_user_id(request)

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            user_id=user_id,
            endpoint=request.url.path,
            method=request.method,
        )
        request.state.request_id = request_id
        request.state.user_id = user_id

        start = time.perf_counter()
        status_code = 500
        response = None
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception:
            API_ERRORS.labels(endpoint=request.url.path).inc()
            log.exception("request_failed")
            raise
        finally:
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            log_fn = log.info if status_code < 500 else log.error
            log_fn(
                "request_completed",
                status=status_code,
                latency_ms=latency_ms,
                query_params=str(request.query_params) if request.query_params else None,
            )
            if response is not None:
                response.headers["X-Request-ID"] = request_id
