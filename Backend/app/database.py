import os
from dotenv import load_dotenv
from app.core.logging_config import get_logger

log = get_logger(__name__)

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI") or os.getenv("DATABASE_URL")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "auvon")

try:
    from pymongo import MongoClient
    from bson import ObjectId
    _has_pymongo = True
except ImportError:
    MongoClient = None
    _has_pymongo = False

    class ObjectId:
        def __init__(self, val=None):
            self.val = str(val) if val else ""
        def __str__(self):
            return self.val
        def __repr__(self):
            return f"ObjectId('{self.val}')"
        def __eq__(self, other):
            return str(self) == str(other)

if _has_pymongo and MONGODB_URI:
    try:
        client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=2000,
            connectTimeoutMS=2000,
        )
        db = client[MONGODB_DATABASE]
    except Exception as e:
        log.error("mongo_connection_initialization_failed", error=str(e))
        db = None
else:
    # Never fall back silently: a fake database makes logins "work" with a fake user
    # and quietly drops every write. Fail loudly unless explicitly allowed (tests only).
    if os.getenv("ALLOW_MOCK_DB", "").lower() not in ("1", "true", "yes"):
        raise RuntimeError(
            "MongoDB is not available: "
            + ("pymongo is not installed (pip install -r requirements.txt)" if not _has_pymongo
               else "MONGODB_URI is not set")
            + ". Set ALLOW_MOCK_DB=1 only for tests."
        )

    class MockCollection:
        def find(self, *args, **kwargs): return []
        def find_one(self, *args, **kwargs): return None
        def insert_one(self, doc, *args, **kwargs):
            class Res: inserted_id = "mock_id"
            return Res()
        def insert_many(self, docs, *args, **kwargs): pass
        def update_one(self, *args, **kwargs): pass
        def update_many(self, *args, **kwargs): pass
        def delete_one(self, *args, **kwargs): pass
        def delete_many(self, *args, **kwargs): pass
        def create_index(self, *args, **kwargs): pass

    class MockDB:
        def __getitem__(self, name): return MockCollection()
        def command(self, *args, **kwargs): return {"ok": 1}

    db = MockDB()

# Primary collections
users_col = db["users"]
notes_col = db["notes"]
user_notes_col = db["user_notes"]
tasks_col = db["tasks"]
goals_col = db["goals"]
steps_col = db["steps"]
progress_col = db["progress"]
tests_col = db["tests"]
questions_col = db["questions"]
test_results_col = db["test_results"]
user_answers_col = db["user_answers"]
ai_logs_col = db["ai_logs"]
document_chunks_col = db["document_chunks"]
tutor_sessions_col = db["tutor_sessions"]
tutor_usage_col = db["tutor_usage"]
tutor_lessons_col = db["tutor_lessons"]


def init_db():
    """Ensure essential indexes exist for performance and uniqueness."""
    try:
        if db is None or not (_has_pymongo and MONGODB_URI):
            return
        db.command("ping")
        users_col.create_index("email", unique=True)
        users_col.create_index("id", sparse=True)
        tasks_col.create_index("user_id")
        goals_col.create_index("user_id")
        steps_col.create_index("goal_id")
        notes_col.create_index("hash_key", sparse=True)
        user_notes_col.create_index([("user_id", 1), ("note_id", 1)])
        tests_col.create_index("user_id")
        questions_col.create_index("test_id")
        test_results_col.create_index([("user_id", 1), ("test_id", 1)])
        user_answers_col.create_index([("user_id", 1), ("test_id", 1)])
        document_chunks_col.create_index("note_id")
        tutor_sessions_col.create_index([("user_id", 1), ("updated_at", -1)])
        tutor_usage_col.create_index([("user_id", 1), ("date", 1)], unique=True)
        tutor_lessons_col.create_index([("user_id", 1), ("updated_at", -1)])
        log.info("mongo_indexes_initialized")
    except Exception as e:
        log.warning("mongo_index_init_warning", error=str(e))


def get_db():
    """FastAPI dependency yielding the MongoDB database instance."""
    return db


def to_object_id(val):
    """Safely converts string or ObjectId to ObjectId."""
    if not val:
        return None
    if isinstance(val, ObjectId):
        return val
    try:
        val_str = str(val).strip()
        if len(val_str) == 24 and all(c in "0123456789abcdefABCDEF" for c in val_str):
            return ObjectId(val_str)
    except Exception:
        pass
    return None


def id_filter(val):
    """Returns a MongoDB filter that matches either _id (as ObjectId/str/int) or id (string/int)."""
    val_str = str(val) if val is not None else ""
    conditions = [
        {"id": val},
        {"id": val_str},
        {"_id": val_str},
    ]
    try:
        conditions.append({"id": int(val)})
        conditions.append({"_id": int(val)})
    except (ValueError, TypeError):
        pass
    obj_id = to_object_id(val)
    if obj_id:
        conditions.append({"_id": obj_id})
    return {"$or": conditions}


def serialize_doc(doc):
    """Converts a MongoDB document to JSON-safe dict, ensuring an 'id' string field."""
    if not doc:
        return None
    d = dict(doc)
    if "_id" in d:
        doc_id = str(d["_id"])
        if "id" not in d or d["id"] is None:
            d["id"] = doc_id
        d["_id"] = doc_id
    return d


def serialize_docs(docs):
    return [serialize_doc(d) for d in docs]


# Compatibility stubs for legacy imports
Base = None
engine = None
SessionLocal = get_db
