import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.core.logging_config import configure_logging, get_logger
from app.core.middleware import RequestContextMiddleware
from app.core.metrics import setup_metrics
from app.core.tracing import setup_tracing
from app.core.limiter import limiter
from app.database import init_db

from app.routes import auth
from app.routes import notes
from app.routes import progress
from app.routes import tasks
from app.routes import stats
from app.routes import goals
from app.routes import tests
from app.routes import videos

configure_logging()
log = get_logger(__name__)

# Initialize MongoDB indexes
try:
    init_db()
except Exception as e:
    log.warning("mongo_init_failed", error=str(e))

app = FastAPI(title="Auvon.ai API")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(GZipMiddleware, minimum_size=1000)

origins = [
    "https://auvon-ai.vercel.app",
    "https://auvon-be0imxvrg-vaidik-dave23s-projects.vercel.app",
    "https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net",
    "http://localhost:5173",
    "http://localhost:3000",
]

cors_env = os.getenv("CORS_ORIGINS")
if cors_env:
    for o in cors_env.split(","):
        clean = o.strip()
        if clean and clean not in origins:
            origins.append(clean)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*(\.vercel\.app|\.azurewebsites\.net|\.azurecontainerapps\.io)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestContextMiddleware)

setup_metrics(app)
setup_tracing(app)


@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok", "db": "mongodb"}


app.include_router(auth.router)
app.include_router(notes.router)
app.include_router(progress.router)
app.include_router(tasks.router)
app.include_router(stats.router)
app.include_router(goals.router)
app.include_router(tests.router)
app.include_router(videos.router)
