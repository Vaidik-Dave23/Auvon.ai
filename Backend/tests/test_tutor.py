import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from app.main import app
from app.models.user import User
from app.utils.dependencies import get_verified_user


class MemoryCollection:
    def __init__(self):
        self.docs = []

    def insert_one(self, doc):
        d = dict(doc)
        if "_id" not in d:
            d["_id"] = f"id_{len(self.docs)+1}"
        self.docs.append(d)
        class Res:
            inserted_id = d["_id"]
        return Res()

    def find_one(self, filter_dict=None, *args, **kwargs):
        docs = self.find(filter_dict)
        return docs[0] if docs else None

    def find(self, filter_dict=None, projection=None, *args, **kwargs):
        res = []
        filter_dict = filter_dict or {}
        for d in self.docs:
            match = True
            for k, v in filter_dict.items():
                if k == "$or" and isinstance(v, list):
                    or_match = False
                    for cond in v:
                        if all(str(d.get(ck)) == str(cv) for ck, cv in cond.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif isinstance(v, dict) and "$in" in v:
                    val = d.get(k)
                    in_list = [str(x) for x in v["$in"]]
                    if str(val) not in in_list:
                        match = False
                        break
                else:
                    if str(d.get(k)) != str(v):
                        match = False
                        break
            if match:
                res.append(dict(d))

        class Cursor(list):
            def sort(self, *args, **kwargs):
                return self
            def limit(self, n):
                return Cursor(self[:n])

        return Cursor(res)

    def update_one(self, filter_dict, update_dict, upsert=False):
        found = False
        for d in self.docs:
            match = True
            for k, v in filter_dict.items():
                if str(d.get(k)) != str(v):
                    match = False
                    break
            if match:
                found = True
                if "$inc" in update_dict:
                    for ik, iv in update_dict["$inc"].items():
                        d[ik] = d.get(ik, 0) + iv
                if "$set" in update_dict:
                    for sk, sv in update_dict["$set"].items():
                        if "." in sk:
                            parts = sk.split(".")
                            curr = d
                            for p in parts[:-1]:
                                curr = curr.setdefault(p, {})
                            curr[parts[-1]] = sv
                        else:
                            d[sk] = sv
                if "$push" in update_dict:
                    for pk, pv in update_dict["$push"].items():
                        if pk not in d:
                            d[pk] = []
                        if isinstance(pv, dict) and "$each" in pv:
                            d[pk].extend(pv["$each"])
                        else:
                            d[pk].append(pv)
                break
        if not found and upsert:
            new_doc = dict(filter_dict)
            if "$inc" in update_dict:
                for ik, iv in update_dict["$inc"].items():
                    new_doc[ik] = iv
            if "$set" in update_dict:
                for sk, sv in update_dict["$set"].items():
                    new_doc[sk] = sv
            self.insert_one(new_doc)

    def delete_many(self, filter_dict):
        before = len(self.docs)
        new_docs = []
        for d in self.docs:
            match = True
            for k, v in filter_dict.items():
                if isinstance(v, dict) and "$in" in v:
                    if str(d.get(k)) in [str(x) for x in v["$in"]]:
                        match = True
                    else:
                        match = False
                elif str(d.get(k)) != str(v):
                    match = False
            if not match:
                new_docs.append(d)
        self.docs = new_docs
        class Res:
            deleted_count = before - len(self.docs)
        return Res()

    def delete_one(self, filter_dict):
        idx_to_del = -1
        for idx, d in enumerate(self.docs):
            match = True
            for k, v in filter_dict.items():
                if str(d.get(k)) != str(v):
                    match = False
                    break
            if match:
                idx_to_del = idx
                break
        if idx_to_del >= 0:
            self.docs.pop(idx_to_del)
            deleted = 1
        else:
            deleted = 0
        class Res:
            deleted_count = deleted
        return Res()


# Shared in-memory test collections
mem_tutor_sessions = MemoryCollection()
mem_tutor_usage = MemoryCollection()
mem_user_notes = MemoryCollection()
mem_document_chunks = MemoryCollection()
mem_notes = MemoryCollection()
mem_test_results = MemoryCollection()
mem_user_answers = MemoryCollection()
mem_goals = MemoryCollection()
mem_steps = MemoryCollection()


@pytest.fixture(autouse=True)
def patch_db_collections(monkeypatch):
    """Patch all collections used by the tutor router to use in-memory stores."""
    for mod_path in ["app.routes.tutor", "app.database"]:
        try:
            monkeypatch.setattr(f"{mod_path}.tutor_sessions_col", mem_tutor_sessions)
            monkeypatch.setattr(f"{mod_path}.tutor_usage_col", mem_tutor_usage)
            monkeypatch.setattr(f"{mod_path}.user_notes_col", mem_user_notes)
            monkeypatch.setattr(f"{mod_path}.document_chunks_col", mem_document_chunks)
            monkeypatch.setattr(f"{mod_path}.notes_col", mem_notes)
            monkeypatch.setattr(f"{mod_path}.test_results_col", mem_test_results)
            monkeypatch.setattr(f"{mod_path}.user_answers_col", mem_user_answers)
            monkeypatch.setattr(f"{mod_path}.goals_col", mem_goals)
            monkeypatch.setattr(f"{mod_path}.steps_col", mem_steps)
        except AttributeError:
            pass

    # Clear before each test
    for col in [
        mem_tutor_sessions,
        mem_tutor_usage,
        mem_user_notes,
        mem_document_chunks,
        mem_notes,
        mem_test_results,
        mem_user_answers,
        mem_goals,
        mem_steps,
    ]:
        col.docs.clear()


@pytest.fixture
def mock_user():
    return User(
        id="user_test_123",
        name="Test User",
        email="testuser@example.com",
        is_verified=True,
    )


@pytest.fixture
def client_authenticated(mock_user):
    def override_verified_user():
        return mock_user

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_verified_user] = override_verified_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous_overrides)


@pytest.fixture
def client_unauthenticated():
    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous_overrides)


class TestTutorAuth:
    """Requirement 1: Authentication is strictly required."""

    def test_auth_required_post_chat(self, client_unauthenticated):
        res = client_unauthenticated.post(
            "/tutor/chat",
            json={"message": "What is photosynthesis?"}
        )
        assert res.status_code == 401

    def test_auth_required_get_sessions(self, client_unauthenticated):
        res = client_unauthenticated.get("/tutor/sessions")
        assert res.status_code == 401

    def test_auth_required_get_session_by_id(self, client_unauthenticated):
        res = client_unauthenticated.get("/tutor/sessions/session_xyz")
        assert res.status_code == 401

    def test_auth_required_delete_session(self, client_unauthenticated):
        res = client_unauthenticated.delete("/tutor/sessions/session_xyz")
        assert res.status_code == 401


class TestTutorDailyCap:
    """Requirement 2: Daily cap returns 429 when usage reaches 50."""

    def test_daily_cap_exceeded_returns_429(self, client_authenticated, mock_user):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Simulate user already used 50 messages today
        mem_tutor_usage.insert_one({
            "user_id": str(mock_user.id),
            "date": today,
            "count": 50,
        })

        res = client_authenticated.post(
            "/tutor/chat",
            json={"message": "Can you give me a hint on quantum mechanics?"}
        )
        assert res.status_code == 429
        data = res.json()
        assert "Daily tutor message limit reached" in data.get("detail", "")


class TestTutorRetrievalScopedToUserNotes:
    """Requirement 3: Retrieval only returns chunks from the user's own notes."""

    @patch("app.routes.tutor.ai")
    @patch("app.routes.tutor.get_query_embedding")
    def test_retrieval_scopes_strictly_to_user_notes(
        self, mock_get_embedding, mock_ai, client_authenticated, mock_user
    ):
        mock_ai.return_value = "Here is a hint based on your note: think about energy conservation."
        mock_get_embedding.return_value = [1.0, 0.0, 0.0]

        # Setup User A's note and chunks
        user_id_a = str(mock_user.id)
        note_a_id = "note_user_a_001"
        note_b_id = "note_user_b_999"

        # User A owns note_a
        mem_user_notes.insert_one({"user_id": user_id_a, "note_id": note_a_id})
        mem_notes.insert_one({"_id": note_a_id, "title": "User A Physics Notes"})
        mem_document_chunks.insert_one({
            "note_id": note_a_id,
            "chunk_text": "Energy can neither be created nor destroyed.",
            "embedding": [1.0, 0.0, 0.0],
        })

        # Another user owns note_b with secret info
        mem_notes.insert_one({"_id": note_b_id, "title": "Other User Private Notes"})
        mem_document_chunks.insert_one({
            "note_id": note_b_id,
            "chunk_text": "Top Secret Other User Research Note Content.",
            "embedding": [1.0, 0.0, 0.0],
        })

        # Case 1: General tutor chat (no note_id given)
        res = client_authenticated.post(
            "/tutor/chat",
            json={"message": "What is the first law of thermodynamics?"}
        )
        assert res.status_code == 200
        data = res.json()
        sources = data.get("sources", [])
        source_note_ids = [s["note_id"] for s in sources]

        # Ensure only User A's note is included
        assert note_a_id in source_note_ids
        assert note_b_id not in source_note_ids

        # Verify prompt passed to AI only contains User A's chunk
        called_prompt = mock_ai.call_args[0][0]
        system_content = next(m["content"] for m in called_prompt if m["role"] == "system")
        assert "Energy can neither be created nor destroyed" in system_content
        assert "Top Secret Other User Research" not in system_content

        # Case 2: User explicitly tries to access other user's note_id in request
        res_exploit = client_authenticated.post(
            "/tutor/chat",
            json={
                "message": "Tell me about this note",
                "note_id": note_b_id
            }
        )
        assert res_exploit.status_code == 200
        data_exploit = res_exploit.json()
        exploit_sources = data_exploit.get("sources", [])
        assert note_b_id not in [s["note_id"] for s in exploit_sources]


class TestTutorUnsubmittedTestAnswerGuard:
    """Requirement 4: An unsubmitted test_id never leaks the correct answer."""

    @patch("app.routes.tutor.ai")
    def test_unsubmitted_test_enforces_concept_only_guard(
        self, mock_ai, client_authenticated, mock_user
    ):
        mock_ai.return_value = "What is the difference between speed and velocity in terms of direction?"
        test_id = "checkpoint_test_active_777"

        res = client_authenticated.post(
            "/tutor/chat",
            json={
                "message": "Is the answer to question 3 option B?",
                "test_id": test_id
            }
        )
        assert res.status_code == 200

        # Inspect prompt passed to AI
        mock_ai.assert_called_once()
        called_prompt = mock_ai.call_args[0][0]
        system_msg = next(m["content"] for m in called_prompt if m["role"] == "system")

        # Verify strict guardrails are present in system prompt
        assert "CRITICAL TEST INTEGRITY GUARD" in system_msg
        assert "unsubmitted checkpoint or test" in system_msg
        assert "NEVER reveal, confirm, validate, or hint at the correct answer or multiple choice option letter" in system_msg
        assert "Explain only the underlying general concept Socratically" in system_msg
