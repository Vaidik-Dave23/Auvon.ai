import os
from slowapi import Limiter
from slowapi.util import get_remote_address

REDIS_URL = os.getenv("REDIS_URL")

# Resolve rate limit key by user ID if authenticated, else client IP address
def resolve_rate_limit_key(request):
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"rate_limit_user:{user_id}"
    return get_remote_address(request)

# Configure slowapi Limiter
limiter = Limiter(
    key_func=resolve_rate_limit_key,
    storage_uri=REDIS_URL if REDIS_URL else "memory://"
)
