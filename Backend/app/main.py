from fastapi import FastAPI
from app.database import engine
from app import database

from app.core.logging_config import configure_logging, get_logger
from app.core.middleware import RequestContextMiddleware
from app.core.metrics import setup_metrics
from app.core.tracing import setup_tracing

configure_logging()
log = get_logger(__name__)

from app.models.user import User
from app.models.notes import Notes , UserNotes
from app.models.task import Task
from app.models.goal import Goal
from app.models.goal import Step
from app.models.progress import Progress
from app.models.test import Test, Question
from app.models.results import Test_Result
from app.models.ai_log import AILog
from app.models.chunk import DocumentChunk

from app.routes import auth
from app.routes import notes

from app.routes import progress
from app.routes import tasks
from app.routes import stats
from app.routes import goals
from app.routes import tests

from fastapi.middleware.cors import CORSMiddleware

# Create tables on startup
database.Base.metadata.create_all(bind=engine)

# Dynamically add columns if they don't exist
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE NOT NULL;"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code VARCHAR;"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires_at TIMESTAMP;"))
        conn.commit()
    except Exception as e:
        log.warning("db_migration_note", error=str(e))

app = FastAPI()

from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.core.limiter import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
origins = [
    "https://auvon-ai.vercel.app",
    "https://auvon-be0imxvrg-vaidik-dave23s-projects.vercel.app",
    "http://localhost:5173",

]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Order matters: this must be added so it's the outermost middleware,
# wrapping CORS and every route, so request_id/timing cover the whole
# request lifecycle.
app.add_middleware(RequestContextMiddleware)

setup_metrics(app)       # -> GET /metrics (Prometheus scrape target)
setup_tracing(app, engine)  # OTel spans exported to OTEL_EXPORTER_OTLP_ENDPOINT


@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(notes.router)
app.include_router(progress.router)
app.include_router(tasks.router)
app.include_router(stats.router)
app.include_router(goals.router)
app.include_router(tests.router)