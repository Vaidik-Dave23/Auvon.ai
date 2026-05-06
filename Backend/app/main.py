from fastapi import FastAPI
from app.database import engine
from app import database

from app.models.user import User
from app.models.notes import Notes , UserNotes
from app.models.task import Task
from app.models.goal import Goal
from app.models.goal import Step
from app.models.progress import Progress
from app.models.test import Test, Question
from app.models.results import Test_Result

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

app = FastAPI()
origins = [
    "https://auvon-ai.vercel.app",
    "https://auvon-be0imxvrg-vaidik-dave23s-projects.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(notes.router)
app.include_router(progress.router)
app.include_router(tasks.router)
app.include_router(stats.router)
app.include_router(goals.router)
app.include_router(tests.router)