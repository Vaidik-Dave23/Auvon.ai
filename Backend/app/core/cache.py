import os
import redis
from app.core.logging_config import get_logger

logger = get_logger(__name__)

REDIS_URL = os.getenv("REDIS_URL")
redis_client = None

if REDIS_URL:
    try:
        redis_client = redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_timeout=2,
            socket_connect_timeout=2
        )
        redis_client.ping()
        logger.info("redis_connected", url=REDIS_URL[:30] + "...")
    except Exception as e:
        logger.warning("redis_unavailable", error=str(e))
        redis_client = None
else:
    logger.info("redis_not_configured_running_uncached")
