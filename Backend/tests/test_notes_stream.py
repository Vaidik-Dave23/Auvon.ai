"""Streaming note generation: SSE events, key failover before the first
token, no same-key retry on timeout, cache hits, and token logging.

Needs `mongomock` (dev only): pip install mongomock
"""
import json

import pytest
import requests

mongomock = pytest.importorskip("mongomock")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes import notes as notes_routes  # noqa: E402
from app.services import ai as ai_mod  # noqa: E402
from app.utils.dependencies import get_verified_user  # noqa: E402

USER = User(id="u1", name="Test", email="t@example.com", is_verified=True)


class FakeStream:
    def __init__(self, status=200, chunks=(), body="", usage=None):
        self.status_code = status
        self.text = body
        self._lines = []
        for c in chunks:
            self._lines.append("data: " + json.dumps({"choices": [{"delta": {"content": c}}]}))
            self._lines.append("")
        if usage:
            self._lines.append("data: " + json.dumps({"choices": [], "usage": usage}))
        self._lines.append("data: [DONE]")

    def iter_lines(self, decode_unicode=True):
        yield from self._lines

    def close(self):
        pass


@pytest.fixture()
def env(monkeypatch):
    db = mongomock.MongoClient()["t"]
    monkeypatch.setattr(notes_routes, "notes_col", db["notes"])
    monkeypatch.setattr(notes_routes, "user_notes_col", db["user_notes"])
    monkeypatch.setattr(ai_mod, "ai_logs_col", db["ai_logs"])
    monkeypatch.setattr(notes_routes, "embed_and_store_note_chunks", lambda *a, **k: None)
    monkeypatch.setattr(notes_routes.limiter, "enabled", False)
    monkeypatch.setattr(ai_mod, "_load_gemini_keys", lambda: ["key-a", "key-b"])
    monkeypatch.setattr(ai_mod, "load_dotenv", lambda **k: None)
    app.dependency_overrides[get_verified_user] = lambda: USER
    calls = []
    yield {"client": TestClient(app), "db": db, "calls": calls, "monkeypatch": monkeypatch}
    app.dependency_overrides.clear()


def events(resp):
    return [json.loads(line[5:]) for line in resp.text.splitlines() if line.startswith("data:")]


def test_streams_deltas_then_saves_the_note(env):
    def post(url, headers=None, json=None, stream=False, timeout=None):
        env["calls"].append((headers["Authorization"], json["model"], json.get("reasoning_effort")))
        return FakeStream(chunks=["## RAG\n", "Retrieval ", "augmented."], usage={"prompt_tokens": 120, "completion_tokens": 30})

    env["monkeypatch"].setattr(ai_mod._session, "post", post)
    r = env["client"].post("/notes/generate/stream", params={"query": "RAG"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    ev = events(r)
    assert [e["text"] for e in ev if e["type"] == "delta"] == ["## RAG\n", "Retrieval ", "augmented."]
    done = ev[-1]
    assert done["type"] == "done" and done["source"] == "ai"
    assert done["note"]["content"] == "## RAG\nRetrieval augmented." and done["note"]["id"]
    assert env["db"]["user_notes"].count_documents({"user_id": "u1"}) == 1
    # fast model, thinking off, first try
    assert env["calls"][0][1] == ai_mod.GEMINI_FALLBACK_MODEL and env["calls"][0][2] == "none"
    log = env["db"]["ai_logs"].find_one({})
    assert log["total_tokens"] == 150 and log["endpoint"].startswith("generate_notes_stream_gemini/")


def test_fails_over_to_next_key_before_first_token(env):
    def post(url, headers=None, json=None, stream=False, timeout=None):
        env["calls"].append(headers["Authorization"])
        if headers["Authorization"].endswith("key-a"):
            return FakeStream(status=429, body='{"error": {"message": "per minute"}}')
        return FakeStream(chunks=["ok"])

    env["monkeypatch"].setattr(ai_mod._session, "post", post)
    ev = events(env["client"].post("/notes/generate/stream", params={"query": "Binary search"}))
    assert ev[-1]["type"] == "done" and ev[-1]["note"]["content"] == "ok"
    assert env["calls"] == ["Bearer key-a", "Bearer key-b"]


def test_second_request_for_same_topic_comes_from_cache_instantly(env):
    env["monkeypatch"].setattr(ai_mod._session, "post", lambda *a, **k: FakeStream(chunks=["x"]))
    env["client"].post("/notes/generate/stream", params={"query": "Heaps"})
    env["monkeypatch"].setattr(ai_mod._session, "post", lambda *a, **k: pytest.fail("should not call the model"))
    ev = events(env["client"].post("/notes/generate/stream", params={"query": "heaps "}))
    assert len(ev) == 1 and ev[0]["source"] == "cache" and ev[0]["note"]["content"] == "x"


def test_all_streams_fail_falls_back_to_blocking_router(env):
    env["monkeypatch"].setattr(ai_mod._session, "post", lambda *a, **k: FakeStream(status=500, body="boom"))
    env["monkeypatch"].setattr(ai_mod, "ai", lambda prompt, **kw: "from openai")
    ev = events(env["client"].post("/notes/generate/stream", params={"query": "Tries"}))
    assert ev[-1]["type"] == "done" and ev[-1]["note"]["content"] == "from openai"


def test_rejects_empty_topic(env):
    assert env["client"].post("/notes/generate/stream", params={"query": "  "}).status_code == 400


def test_timeout_does_not_retry_the_same_key(monkeypatch):
    tries = []

    def post(*a, **k):
        tries.append(1)
        raise requests.exceptions.ReadTimeout("slow")

    monkeypatch.setattr(ai_mod._session, "post", post)
    with pytest.raises(requests.exceptions.Timeout):
        ai_mod._call_gemini("k", "m", [{"role": "user", "content": "hi"}])
    assert len(tries) == 1


def test_400_retries_once_without_optional_fields(env):
    sent = []

    def post(url, headers=None, json=None, stream=False, timeout=None):
        sent.append(dict(json))
        if "stream_options" in json:
            return FakeStream(status=400, body='{"error": {"message": "Unknown name stream_options"}}')
        return FakeStream(chunks=["still streamed"])

    env["monkeypatch"].setattr(ai_mod._session, "post", post)
    ev = events(env["client"].post("/notes/generate/stream", params={"query": "Graphs"}))
    assert ev[0] == {"type": "delta", "text": "still streamed"}
    assert len(sent) == 2 and "reasoning_effort" not in sent[1] and "stream_options" not in sent[1]


# ---------------------------------------------------------------------------
# Streaming note Q&A and tutor chat
# ---------------------------------------------------------------------------
from app.routes import tutor as tutor_routes  # noqa: E402


def test_note_question_streams_and_caches_sources(env):
    db = env["db"]
    nid = str(db["notes"].insert_one({"title": "RAG", "content": "RAG retrieves chunks then generates."}).inserted_id)
    db["user_notes"].insert_one({"user_id": "u1", "note_id": nid})
    db["document_chunks"].insert_one({"note_id": nid, "chunk_text": "RAG retrieves chunks then generates.", "embedding": [1.0, 0.0]})
    env["monkeypatch"].setattr(notes_routes, "document_chunks_col", db["document_chunks"])
    env["monkeypatch"].setattr(notes_routes, "get_query_embedding", lambda q: [1.0, 0.0])
    env["monkeypatch"].setattr(ai_mod._session, "post", lambda *a, **k: FakeStream(chunks=["It retrieves ", "first [Source 1]."]))
    ev = events(env["client"].post(f"/notes/{nid}/query/stream", params={"query": "what does rag do"}))
    assert [e["text"] for e in ev if e["type"] == "delta"] == ["It retrieves ", "first [Source 1]."]
    assert ev[-1]["type"] == "done" and ev[-1]["answer"] == "It retrieves first [Source 1]."
    assert ev[-1]["sources"] == ["RAG retrieves chunks then generates."]


def test_note_question_stream_checks_ownership(env):
    nid = str(env["db"]["notes"].insert_one({"title": "x", "content": "y"}).inserted_id)
    assert env["client"].post(f"/notes/{nid}/query/stream", params={"query": "q"}).status_code == 403


def test_tutor_chat_streams_and_saves_the_session(env):
    db = env["db"]
    for name in ["tutor_sessions_col", "tutor_usage_col", "user_notes_col", "document_chunks_col", "notes_col",
                 "test_results_col", "user_answers_col", "goals_col", "steps_col"]:
        env["monkeypatch"].setattr(tutor_routes, name, db[name.replace("_col", "")])
    env["monkeypatch"].setattr(tutor_routes.limiter, "enabled", False)
    env["monkeypatch"].setattr(ai_mod._session, "post", lambda *a, **k: FakeStream(chunks=["What do ", "you think?"]))
    ev = events(env["client"].post("/tutor/chat/stream", json={"message": "explain recursion"}))
    assert ev[0]["type"] == "meta" and ev[0]["session_id"] and ev[0]["remaining_today"] == 49
    assert ev[-1] == {"type": "done", "reply": "What do you think?"}
    session = db["tutor_sessions"].find_one({})
    assert [m["role"] for m in session["messages"]] == ["user", "assistant"]
    assert session["messages"][1]["content"] == "What do you think?"


def test_tutor_chat_stream_enforces_daily_cap_before_streaming(env):
    db = env["db"]
    for name in ["tutor_sessions_col", "tutor_usage_col"]:
        env["monkeypatch"].setattr(tutor_routes, name, db[name.replace("_col", "")])
    env["monkeypatch"].setattr(tutor_routes.limiter, "enabled", False)
    from datetime import datetime, timezone
    db["tutor_usage"].insert_one({"user_id": "u1", "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "count": 50})
    assert env["client"].post("/tutor/chat/stream", json={"message": "hi"}).status_code == 429


def test_request_logging_middleware_never_crashes_on_a_bad_key(monkeypatch):
    from app.core import middleware as mw
    monkeypatch.setattr(mw, "SECRET_KEY", None)
    assert mw._extract_user_id(type("R", (), {"headers": {"authorization": "Bearer abc.def.ghi"}})()) is None
    monkeypatch.setattr(mw, "SECRET_KEY", "k")
    assert mw._extract_user_id(type("R", (), {"headers": {"authorization": "Bearer not-a-jwt"}})()) is None
    client = TestClient(app)
    assert client.get("/health", headers={"Authorization": "Bearer garbage"}).status_code == 200


def test_stream_decodes_utf8_even_without_charset(env):
    """Gemini's SSE has no charset; requests would decode as Latin-1 and mangle emoji."""
    import io
    from requests.models import Response

    def post(url, headers=None, json=None, stream=False, timeout=None):
        body = ('data: ' + __import__("json").dumps({"choices": [{"delta": {"content": "## 📘 Overview — naïve café"}}]}, ensure_ascii=False)
                + '\n\ndata: [DONE]\n\n').encode("utf-8")
        r = Response()
        r.status_code = 200
        r.headers["Content-Type"] = "text/event-stream"
        r.raw = io.BytesIO(body)
        r.encoding = None
        return r

    env["monkeypatch"].setattr(ai_mod._session, "post", post)
    ev = events(env["client"].post("/notes/generate/stream", params={"query": "Encoding check"}))
    assert ev[-1]["note"]["content"] == "## 📘 Overview — naïve café"


def test_repair_mojibake():
    from scripts.fix_mojibake import repair
    good = "## 📘 Domain Overview — naïve"
    broken = good.encode("utf-8").decode("latin-1")
    assert repair(broken) == good
    assert repair(good) == good          # already fine: untouched
    assert repair("plain ascii") == "plain ascii"
