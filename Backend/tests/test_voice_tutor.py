"""Voice lesson tutor (lecture mode): planning, prefetch + cache, doubts,
approach rotation on confusion, study-only guard, limits.

Needs `mongomock` (dev only): pip install mongomock
The LLM is mocked, so these tests check the rules enforced in code,
not the model's wording.
"""
import json

import pytest

mongomock = pytest.importorskip("mongomock")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes import voice_tutor as vt  # noqa: E402
from app.utils.dependencies import get_verified_user  # noqa: E402


USER = User(id="u1", name="Test", email="t@example.com", is_verified=True)


def seg(text="Here is the idea."):
    return {"say": text, "board": {"action": "add", "lines": [{"text": "w − η·g", "style": "normal"}]}}


def plan(outline=("What RAG is", "Retrieval", "Generation")):
    return json.dumps({"intent": "teach", "topic": "RAG", "outline": list(outline), "segments": [seg("Hi! Today: RAG."), seg("RAG means...")]})


def part(text="Part content.", summary=None):
    d = {"segments": [seg(text), seg("More of it.")]}
    if summary:
        d["summary"] = summary
    return json.dumps(d)


def turn(intent, text="Answer."):
    return json.dumps({"intent": intent, "segments": [] if intent == "continue" else [seg(text)]})


@pytest.fixture()
def env(monkeypatch):
    db = mongomock.MongoClient()["t"]
    for name in ["notes_col", "user_notes_col", "document_chunks_col", "tutor_lessons_col", "tutor_usage_col"]:
        monkeypatch.setattr(vt, name, db[name.replace("_col", "")])
    note_id = str(db["notes"].insert_one({"title": "Neural Nets Ch. 3", "content": "x"}).inserted_id)
    db["user_notes"].insert_one({"user_id": "u1", "note_id": note_id})
    db["document_chunks"].insert_many([
        {"note_id": note_id, "chunk_text": "The learning rate is the step size.", "embedding": None},
        {"note_id": note_id, "chunk_text": "Too large a learning rate makes the loss bounce or blow up.", "embedding": None},
    ])
    calls, kwargs, queue = [], [], []

    def fake_ai(messages, endpoint_name="", temperature=None, **kw):
        calls.append(messages)
        kwargs.append(kw)
        return queue.pop(0)

    monkeypatch.setattr(vt, "ai", fake_ai)
    monkeypatch.setattr(vt.limiter, "enabled", False)
    app.dependency_overrides[get_verified_user] = lambda: USER
    yield {"client": TestClient(app), "note_id": note_id, "queue": queue, "calls": calls, "kwargs": kwargs, "db": db}
    app.dependency_overrides.clear()


def start(e, body=None, outline=("What RAG is", "Retrieval", "Generation")):
    e["queue"].append(plan(outline))
    r = e["client"].post("/tutor/lesson/start", json=body or {"topic": "RAG"})
    assert r.status_code == 200, r.text
    return r.json()


def test_start_plans_the_lesson_and_teaches_part_one_without_quizzing(env):
    body = start(env)
    assert body["status"] == "teaching" and body["outline"] == ["What RAG is", "Retrieval", "Generation"]
    assert body["part_index"] == 0 and body["part_title"] == "What RAG is"
    # the only question is the app's own pause at the END of the part
    assert body["segments"][-1]["say"] == "Any doubts so far, or shall I go ahead?"
    assert all("?" not in s["say"] for s in body["segments"][:-1])
    assert env["kwargs"][0].get("fast") is True


def test_note_lesson_uses_relevant_excerpts(env):
    start(env, {"note_id": env["note_id"], "topic": "learning rate"})
    prompt = env["calls"][0][1]["content"]
    assert "Too large a learning rate" in prompt and "Neural Nets Ch. 3" in prompt


def test_note_lesson_skips_unrelated_excerpts(env):
    start(env, {"note_id": env["note_id"], "topic": "transformers attention"})
    assert "learning rate" not in env["calls"][0][1]["content"].lower()


def test_cannot_start_on_someone_elses_note(env):
    other = str(env["db"]["notes"].insert_one({"title": "Private", "content": "y"}).inserted_id)
    assert env["client"].post("/tutor/lesson/start", json={"note_id": other}).status_code == 404


def test_needs_a_note_or_a_topic(env):
    assert env["client"].post("/tutor/lesson/start", json={}).status_code == 400
    assert env["calls"] == []


def test_off_topic_start_creates_nothing(env):
    env["queue"].append(json.dumps({"intent": "off_topic", "segments": [{"say": "This call is only for studying. What would you like to learn?"}]}))
    body = env["client"].post("/tutor/lesson/start", json={"topic": "bollywood gossip"}).json()
    assert body["status"] == "off_topic" and body["lesson_id"] == ""
    assert env["db"]["tutor_lessons"].count_documents({}) == 0


def test_prefetch_then_go_ahead_is_instant_and_free(env):
    lid = start(env)["lesson_id"]
    env["queue"].append(part("Retrieval finds the right chunks."))
    pre = env["client"].post(f"/tutor/lesson/{lid}/part", json={"index": 1, "advance": False}).json()
    assert pre["part_index"] == 1 and pre["segments"][0]["say"] == "Retrieval finds the right chunks."
    n_calls, left = len(env["calls"]), pre["remaining_today"]
    # "go ahead": served from the cache, no model call, no quota used
    adv = env["client"].post(f"/tutor/lesson/{lid}/part", json={"index": 1, "advance": True}).json()
    assert len(env["calls"]) == n_calls and adv["segments"] == pre["segments"] and adv["remaining_today"] == left
    assert env["db"]["tutor_lessons"].find_one({})["current"] == 1


def test_prefetch_does_not_move_the_lesson(env):
    lid = start(env)["lesson_id"]
    env["queue"].append(part())
    env["client"].post(f"/tutor/lesson/{lid}/part", json={"index": 1})
    assert env["db"]["tutor_lessons"].find_one({})["current"] == 0


def test_cannot_skip_ahead(env):
    lid = start(env)["lesson_id"]
    assert env["client"].post(f"/tutor/lesson/{lid}/part", json={"index": 2}).status_code == 400


def test_doubt_is_answered_then_asks_to_go_ahead(env):
    lid = start(env)["lesson_id"]
    env["queue"].append(turn("question", "A vector database stores embeddings."))
    body = env["client"].post(f"/tutor/lesson/{lid}/turn", json={"text": "what is a vector db"}).json()
    assert body["continue_lecture"] is False
    assert body["segments"][0]["say"] == "A vector database stores embeddings."
    assert body["segments"][-1]["say"].endswith("shall I go ahead?")
    assert body["approach"] == "definition"


def test_model_can_say_the_student_wants_to_continue(env):
    lid = start(env)["lesson_id"]
    env["queue"].append(turn("continue"))
    body = env["client"].post(f"/tutor/lesson/{lid}/turn", json={"text": "theek hai aage chalo"}).json()
    assert body["continue_lecture"] is True and body["segments"] == []


def test_confusion_rotates_approach_then_goes_direct(env):
    lid = start(env)["lesson_id"]
    seen = []
    for _ in range(3):
        env["queue"].append(turn("confused"))
        body = env["client"].post(f"/tutor/lesson/{lid}/turn", json={"text": "I didn't get it"}).json()
        seen.append(body["approach"])
    assert seen == ["analogy", "worked_example", "direct"]
    assert "use the 'direct' approach" in env["calls"][-1][1]["content"]
    assert body["weak_points"] == ["What RAG is"]


def test_moving_to_a_new_part_resets_the_approach(env):
    lid = start(env)["lesson_id"]
    env["queue"].append(turn("confused"))
    env["client"].post(f"/tutor/lesson/{lid}/turn", json={"text": "huh?"})
    env["queue"].append(part())
    body = env["client"].post(f"/tutor/lesson/{lid}/part", json={"index": 1, "advance": True}).json()
    assert body["approach"] == "definition"


def test_full_lesson_ends_with_wrap_up_and_finish(env):
    lid = start(env, outline=("One", "Two"))["lesson_id"]
    env["queue"].append(part("Two."))
    last = env["client"].post(f"/tutor/lesson/{lid}/part", json={"index": 1, "advance": True}).json()
    assert last["segments"][-1]["say"] == "That was the last part. Any doubts, or shall I wrap up?"
    env["queue"].append(part("Recap.", summary="Covered RAG."))
    wrap = env["client"].post(f"/tutor/lesson/{lid}/part", json={"index": 2, "advance": True}).json()
    assert wrap["is_final"] is True and wrap["summary"] == "Covered RAG."
    assert env["client"].post(f"/tutor/lesson/{lid}/finish").json()["status"] == "done"
    assert env["client"].post(f"/tutor/lesson/{lid}/turn", json={"text": "more?"}).status_code == 409


def test_misheard_speech_alternatives_reach_the_model(env):
    lid = start(env)["lesson_id"]
    env["queue"].append(turn("question"))
    env["client"].post(f"/tutor/lesson/{lid}/turn", json={"text": "what is that", "alternatives": ["what is rag"]})
    prompt = env["calls"][-1][1]["content"]
    assert "other hearings: what is rag" in prompt and "may be misheard" in prompt


def test_bad_model_json_still_returns_something_speakable(env):
    lid = start(env)["lesson_id"]
    env["queue"].append("Sure! The learning rate is the step size.")
    body = env["client"].post(f"/tutor/lesson/{lid}/turn", json={"text": "explain again"}).json()
    assert body["segments"][0]["say"].startswith("Sure!")


def test_daily_cap(env):
    env["db"]["tutor_usage"].insert_one({"user_id": "u1", "date": vt.datetime.now(vt.timezone.utc).strftime("%Y-%m-%d"), "count": vt.DAILY_MESSAGE_LIMIT})
    assert env["client"].post("/tutor/lesson/start", json={"topic": "RAG"}).status_code == 429


def test_fast_mode_tries_the_quick_model_with_thinking_off(monkeypatch):
    from app.services import ai as ai_mod

    tried = []

    def fake_call(key, model, prompt, temperature=None, reasoning_effort=None, **kw):
        tried.append((model, reasoning_effort))
        return {"choices": [{"message": {"content": "ok"}}], "usage": {}}

    monkeypatch.setattr(ai_mod, "_call_gemini", fake_call)
    monkeypatch.setattr(ai_mod, "_load_gemini_keys", lambda: ["k1"])
    assert ai_mod.ai([{"role": "user", "content": "hi"}], endpoint_name="t", fast=True) == "ok"
    assert tried[0] == (ai_mod.GEMINI_FALLBACK_MODEL, "none")


def test_gemini_retries_without_reasoning_effort_if_rejected(monkeypatch):
    from app.services import ai as ai_mod

    sent = []

    class R:
        def __init__(self, code, body):
            self.status_code, self._b = code, body
            self.text = json.dumps(body)

        def json(self):
            return self._b

    def post(url, headers=None, json=None, timeout=None):
        sent.append(dict(json))
        if "reasoning_effort" in json:
            return R(400, {"error": {"message": "Invalid value"}})
        return R(200, {"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(ai_mod._session, "post", post)
    out = ai_mod._call_gemini("k", "gemini-x", [{"role": "user", "content": "hi"}], reasoning_effort="none")
    assert out["choices"][0]["message"]["content"] == "ok" and len(sent) == 2
