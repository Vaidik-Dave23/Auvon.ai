"""Security fixes: Google sign-in fails closed, account pre-hijack, optional email
verification, step ownership (IDOR), upload/input limits, and no silent mock DB.

Needs `mongomock` (dev only): pip install mongomock
"""
import io
import os
import subprocess
import sys

import pytest

mongomock = pytest.importorskip("mongomock")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes import auth as auth_routes  # noqa: E402
from app.routes import goals as goals_routes  # noqa: E402
from app.routes import notes as notes_routes  # noqa: E402
from app.routes import tests as tests_routes  # noqa: E402
from app.routes import videos as videos_routes  # noqa: E402
from app.utils import dependencies as deps  # noqa: E402
from app.utils import mail as mail_mod  # noqa: E402
from app.utils.dependencies import get_verified_user  # noqa: E402

MAIL_VARS = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "RESEND_API_KEY", "REQUIRE_EMAIL_VERIFICATION")


@pytest.fixture()
def env(monkeypatch):
    db = mongomock.MongoClient()["t"]
    monkeypatch.setattr(auth_routes, "users_col", db["users"])
    monkeypatch.setattr(deps, "users_col", db["users"])
    monkeypatch.setattr(deps, "redis_client", None)
    monkeypatch.setattr(auth_routes, "redis_client", None)
    for var in MAIL_VARS:
        monkeypatch.delenv(var, raising=False)
    for mod in (goals_routes, videos_routes):
        monkeypatch.setattr(mod, "goals_col", db["goals"])
        monkeypatch.setattr(mod, "steps_col", db["steps"])
    for lim in (auth_routes.limiter,):
        monkeypatch.setattr(lim, "enabled", False)
    sent = []
    monkeypatch.setattr(auth_routes, "send_verification_email", lambda bg, email, name, code: sent.append(("verify", email, code)))
    monkeypatch.setattr(auth_routes, "send_password_reset_email", lambda bg, email, name, pin: sent.append(("reset", email, pin)))
    yield {"db": db, "client": TestClient(app), "sent": sent, "mp": monkeypatch}
    app.dependency_overrides.clear()


def as_user(uid):
    app.dependency_overrides[get_verified_user] = lambda: User(id=uid, name=uid, email=f"{uid}@x.com", is_verified=True)


# ---------------------------------------------------------------- Google sign-in

def test_google_signin_fails_closed_without_client_id(env):
    env["mp"].delenv("GOOGLE_CLIENT_ID", raising=False)
    r = env["client"].post("/auth/google", json={"credential": "anything"})
    assert r.status_code == 503


def test_google_signin_takes_over_a_squatted_password_account(env):
    """Attacker registers victim@gmail.com with a password; the real owner then signs in with Google.
    The attacker's password must stop working."""
    env["mp"].setenv("GOOGLE_CLIENT_ID", "client-123")
    env["mp"].delenv("REQUIRE_EMAIL_VERIFICATION", raising=False)
    c = env["client"]
    assert c.post("/register", json={"name": "x", "email": "victim@gmail.com", "password": "attackerpw"}).status_code == 200
    assert c.post("/login", json={"email": "victim@gmail.com", "password": "attackerpw"}).status_code == 200

    seen = {}

    def fake_verify(token, req, audience=None):
        seen["audience"] = audience
        return {"iss": "accounts.google.com", "email": "victim@gmail.com", "email_verified": True, "name": "Victim"}

    env["mp"].setattr(auth_routes.id_token, "verify_oauth2_token", fake_verify)
    assert c.post("/auth/google", json={"credential": "tok"}).status_code == 200
    assert seen["audience"] == "client-123"
    assert c.post("/login", json={"email": "victim@gmail.com", "password": "attackerpw"}).status_code == 401
    assert env["db"]["users"].find_one({"email": "victim@gmail.com"})["email_confirmed"] is True


def test_google_signin_keeps_password_of_confirmed_account(env):
    env["mp"].setenv("GOOGLE_CLIENT_ID", "client-123")
    c = env["client"]
    c.post("/register", json={"name": "a", "email": "a@gmail.com", "password": "mypassword"})
    env["db"]["users"].update_one({"email": "a@gmail.com"}, {"$set": {"email_confirmed": True}})
    env["mp"].setattr(auth_routes.id_token, "verify_oauth2_token",
                      lambda t, r, audience=None: {"iss": "accounts.google.com", "email": "a@gmail.com", "email_verified": True})
    c.post("/auth/google", json={"credential": "tok"})
    assert c.post("/login", json={"email": "a@gmail.com", "password": "mypassword"}).status_code == 200


# ---------------------------------------------------------------- email verification

def register(c, email, password="pw123456"):
    return c.post("/register", json={"name": "N", "email": email, "password": password})


def test_verification_is_on_by_default_when_email_works(env):
    env["mp"].setenv("SMTP_HOST", "smtp.example.com")
    r = register(env["client"], "v@x.com")
    assert r.json()["is_verified"] is False
    kind, to, code = env["sent"][0]
    assert (kind, to) == ("verify", "v@x.com") and len(code) == 6
    assert env["db"]["users"].find_one({"email": "v@x.com"})["verification_code"] == code


def test_full_verification_flow_unlocks_the_account(env):
    env["mp"].setenv("SMTP_HOST", "smtp.example.com")
    c = env["client"]
    token = register(c, "flow@x.com").json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    assert c.get("/notes/my", headers=h).status_code == 403          # not verified yet
    assert c.post("/verify-email", json={"code": "000000"}, headers=h).status_code == 400
    code = env["sent"][0][2]
    assert c.post("/verify-email", json={"code": code}, headers=h).status_code == 200
    user = env["db"]["users"].find_one({"email": "flow@x.com"})
    assert user["is_verified"] is True and user["email_confirmed"] is True and user["verification_code"] is None


def test_verification_can_be_switched_off(env):
    env["mp"].setenv("SMTP_HOST", "smtp.example.com")
    env["mp"].setenv("REQUIRE_EMAIL_VERIFICATION", "false")
    assert register(env["client"], "off@x.com").json()["is_verified"] is True and env["sent"] == []


def test_verification_is_skipped_when_no_email_provider(env):
    r = register(env["client"], "nomail@x.com")
    assert r.json()["is_verified"] is True   # don't lock users out when mail isn't configured


def test_register_rejects_short_passwords(env):
    assert register(env["client"], "short@x.com", password="123").status_code == 400


# ---------------------------------------------------------------- forgot / reset password

def test_forgot_password_for_unknown_email_says_the_same_and_sends_nothing(env):
    r = env["client"].post("/auth/forgot-password", json={"email": "ghost@x.com"})
    assert r.status_code == 200 and "If an account exists" in r.json()["message"]
    assert env["sent"] == []


def test_forgot_password_sends_a_pin_and_stores_only_its_hash(env):
    c = env["client"]
    register(c, "r@x.com", "oldpassword")
    c.post("/auth/forgot-password", json={"email": "R@X.com"})
    kind, to, pin = env["sent"][-1]
    assert kind == "reset" and to == "r@x.com" and len(pin) == 6
    user = env["db"]["users"].find_one({"email": "r@x.com"})
    assert pin not in str(user.get("reset_pin_hash")) and user["reset_attempts"] == 0


def test_reset_password_with_the_pin(env):
    c = env["client"]
    register(c, "r2@x.com", "oldpassword")
    c.post("/auth/forgot-password", json={"email": "r2@x.com"})
    pin = env["sent"][-1][2]
    r = c.post("/auth/reset-password", json={"email": "r2@x.com", "pin": pin, "new_password": "newpassword1"})
    assert r.status_code == 200
    assert c.post("/login", json={"email": "r2@x.com", "password": "newpassword1"}).status_code == 200
    assert c.post("/login", json={"email": "r2@x.com", "password": "oldpassword"}).status_code == 401
    # the PIN works only once
    again = c.post("/auth/reset-password", json={"email": "r2@x.com", "pin": pin, "new_password": "another-one1"})
    assert again.status_code == 400


def test_reset_password_locks_after_five_wrong_pins(env):
    c = env["client"]
    register(c, "r3@x.com", "oldpassword")
    c.post("/auth/forgot-password", json={"email": "r3@x.com"})
    pin = env["sent"][-1][2]
    wrong = "000000" if pin != "000000" else "111111"
    for _ in range(5):
        assert c.post("/auth/reset-password", json={"email": "r3@x.com", "pin": wrong, "new_password": "newpassword1"}).status_code == 400
    # even the right PIN is refused now; they must request a new one
    assert c.post("/auth/reset-password", json={"email": "r3@x.com", "pin": pin, "new_password": "newpassword1"}).status_code == 429


def test_reset_password_rejects_expired_pin_and_short_password(env):
    c = env["client"]
    register(c, "r4@x.com", "oldpassword")
    c.post("/auth/forgot-password", json={"email": "r4@x.com"})
    pin = env["sent"][-1][2]
    assert c.post("/auth/reset-password", json={"email": "r4@x.com", "pin": pin, "new_password": "short"}).status_code == 400
    from datetime import datetime, timedelta
    env["db"]["users"].update_one({"email": "r4@x.com"}, {"$set": {"reset_pin_expires_at": datetime.utcnow() - timedelta(minutes=1)}})
    assert c.post("/auth/reset-password", json={"email": "r4@x.com", "pin": pin, "new_password": "newpassword1"}).status_code == 400


# ---------------------------------------------------------------- SMTP sending

def test_smtp_is_used_when_configured(monkeypatch):
    for var in MAIL_VARS:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(mail_mod, "load_dotenv", lambda *a, **k: None)
    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USER", "me@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")
    calls = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            calls["host"], calls["port"] = host, port

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self, context=None):
            calls["tls"] = True

        def login(self, user, password):
            calls["login"] = (user, password)

        def send_message(self, msg):
            calls["to"], calls["subject"] = msg["To"], msg["Subject"]

    monkeypatch.setattr(mail_mod.smtplib, "SMTP", FakeSMTP)
    assert mail_mod.send_email_sync("you@x.com", "Hi", "<b>hi</b>") is True
    assert calls == {"host": "smtp.gmail.com", "port": 587, "tls": True, "login": ("me@gmail.com", "app-password"),
                     "to": "you@x.com", "subject": "Hi"}


def test_no_provider_writes_mock_and_reports_not_sent(monkeypatch, tmp_path):
    for var in MAIL_VARS:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(mail_mod, "load_dotenv", lambda *a, **k: None)
    monkeypatch.setattr(mail_mod, "MOCK_EMAIL_FILE", str(tmp_path / "mock.txt"))
    assert mail_mod.send_email_sync("you@x.com", "Hi", "code 123456") is False
    assert "code 123456" in (tmp_path / "mock.txt").read_text()


# ---------------------------------------------------------------- step ownership (IDOR)

def _make_goal(db, owner):
    gid = str(db["goals"].insert_one({"title": "g", "user_id": owner, "steps": []}).inserted_id)
    sid = str(db["steps"].insert_one({"goal_id": gid, "description": "learn x", "week": 1, "is_completed": 0}).inserted_id)
    db["goals"].update_one({}, {"$set": {"steps": [{"id": sid, "description": "learn x", "week": 1, "is_completed": 0}]}})
    return gid, sid


def test_cannot_toggle_someone_elses_step(env):
    _, sid = _make_goal(env["db"], "owner")
    as_user("intruder")
    assert env["client"].put(f"/steps/{sid}").status_code == 404
    assert env["db"]["steps"].find_one({})["is_completed"] == 0


def test_owner_can_toggle_their_step(env):
    _, sid = _make_goal(env["db"], "owner")
    as_user("owner")
    r = env["client"].put(f"/steps/{sid}")
    assert r.status_code == 200 and env["db"]["steps"].find_one({})["is_completed"] == 1


def test_cannot_refresh_videos_or_resources_of_someone_elses_step(env):
    _, sid = _make_goal(env["db"], "owner")
    as_user("intruder")
    env["mp"].setattr(videos_routes.youtube_service, "search_videos", lambda **k: pytest.fail("must not call YouTube"))
    assert env["client"].post(f"/steps/{sid}/videos/refresh").status_code == 404
    assert env["client"].post(f"/steps/{sid}/resources/refresh").status_code == 404


# ---------------------------------------------------------------- input / upload limits

def test_goal_weeks_and_title_are_bounded(env):
    as_user("u1")
    env["mp"].setattr(goals_routes.limiter, "enabled", False)
    assert env["client"].post("/goals/ai", params={"title": "x", "weeks": 500}).status_code == 400
    assert env["client"].post("/goals/ai", params={"title": "x" * 300, "weeks": 4}).status_code == 400


def test_quiz_question_count_and_difficulty_are_bounded(env):
    as_user("u1")
    env["mp"].setattr(tests_routes.limiter, "enabled", False)
    c = env["client"]
    assert c.post("/tests/generate", data={"topic": "x", "num_questions": "500"}).status_code == 400
    assert c.post("/tests/generate", data={"topic": "x", "difficulty": "insane"}).status_code == 400


def test_pdf_upload_rejects_non_pdf_and_huge_files(env):
    as_user("u1")
    env["mp"].setattr(notes_routes.limiter, "enabled", False)
    c = env["client"]
    r = c.post("/notes/pdf", files={"file": ("x.pdf", io.BytesIO(b"not a pdf"), "application/pdf")})
    assert r.status_code == 400
    big = b"%PDF" + b"0" * (10 * 1024 * 1024 + 10)
    r = c.post("/notes/pdf", files={"file": ("big.pdf", io.BytesIO(big), "application/pdf")})
    assert r.status_code == 413


# ---------------------------------------------------------------- no silent mock DB

def test_app_refuses_to_start_without_a_database():
    backend = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    clean_env = {k: v for k, v in os.environ.items() if k not in ("MONGODB_URI", "DATABASE_URL", "ALLOW_MOCK_DB")}
    code = "import dotenv; dotenv.load_dotenv = lambda *a, **k: None\nimport app.database"
    r = subprocess.run([sys.executable, "-c", code], cwd=backend, env=clean_env, capture_output=True, text=True)
    assert r.returncode != 0 and "MongoDB is not available" in r.stderr


# ---------------------------------------------------------------- rate-limited routes

def test_every_rate_limited_route_takes_a_starlette_request():
    """slowapi crashes (500) at request time if a limited endpoint's `request` param
    isn't the Starlette Request. Tests usually disable the limiter, so check signatures."""
    import inspect
    from starlette.requests import Request
    from fastapi.routing import APIRoute
    from app.core.limiter import limiter

    limited = set(limiter._route_limits)
    checked = 0
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        fn = route.endpoint
        name = f"{fn.__module__}.{fn.__name__}"
        if name not in limited:
            continue
        checked += 1
        param = inspect.signature(fn).parameters.get("request")
        assert param is not None and param.annotation is Request, f"{name}: `request` must be a starlette Request"
    assert checked >= 10


def test_verify_email_works_with_the_rate_limiter_on(env):
    env["mp"].setattr(auth_routes.limiter, "enabled", True)
    env["mp"].setenv("SMTP_HOST", "smtp.example.com")
    c = env["client"]
    token = register(c, "limited@x.com").json()["access_token"]
    code = env["sent"][0][2]
    r = c.post("/verify-email", json={"code": code}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------- refresh tokens

def test_login_returns_a_refresh_token_that_renews_the_session(env):
    c = env["client"]
    register(c, "rt@x.com", "password123")
    tokens = c.post("/login", json={"email": "rt@x.com", "password": "password123"}).json()
    assert tokens["access_token"] and tokens["refresh_token"]
    new = c.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert new.status_code == 200
    body = new.json()
    assert body["refresh_token"] and body["access_token"]
    assert c.get("/me", headers={"Authorization": f"Bearer {body['access_token']}"}).status_code == 200


def test_refresh_token_cannot_be_used_as_an_access_token(env):
    c = env["client"]
    register(c, "rt2@x.com", "password123")
    refresh = c.post("/login", json={"email": "rt2@x.com", "password": "password123"}).json()["refresh_token"]
    assert c.get("/me", headers={"Authorization": f"Bearer {refresh}"}).status_code == 401


def test_access_token_cannot_be_posted_as_a_refresh_token(env):
    c = env["client"]
    register(c, "rt3@x.com", "password123")
    access = c.post("/login", json={"email": "rt3@x.com", "password": "password123"}).json()["access_token"]
    assert c.post("/auth/refresh", json={"refresh_token": access}).status_code == 401


def test_password_reset_signs_out_existing_refresh_tokens(env):
    c = env["client"]
    register(c, "rt4@x.com", "password123")
    old_refresh = c.post("/login", json={"email": "rt4@x.com", "password": "password123"}).json()["refresh_token"]
    c.post("/auth/forgot-password", json={"email": "rt4@x.com"})
    pin = env["sent"][-1][2]
    assert c.post("/auth/reset-password", json={"email": "rt4@x.com", "pin": pin, "new_password": "brandnew123"}).status_code == 200
    assert c.post("/auth/refresh", json={"refresh_token": old_refresh}).status_code == 401
    fresh = c.post("/login", json={"email": "rt4@x.com", "password": "brandnew123"}).json()["refresh_token"]
    assert c.post("/auth/refresh", json={"refresh_token": fresh}).status_code == 200


def test_old_clients_can_upgrade_with_a_valid_access_token_header(env):
    c = env["client"]
    register(c, "rt5@x.com", "password123")
    access = c.post("/login", json={"email": "rt5@x.com", "password": "password123"}).json()["access_token"]
    r = c.post("/auth/refresh", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 200 and r.json()["refresh_token"]


def test_refresh_rejects_garbage_and_missing_tokens(env):
    c = env["client"]
    assert c.post("/auth/refresh", json={"refresh_token": "not-a-jwt"}).status_code == 401
    assert c.post("/auth/refresh").status_code == 401


def test_expired_access_token_is_rejected_but_refresh_still_works(env):
    from datetime import datetime, timedelta
    from jose import jwt
    from app.utils.token import SECRET_KEY, ALGORITHM
    c = env["client"]
    register(c, "rt6@x.com", "password123")
    tokens = c.post("/login", json={"email": "rt6@x.com", "password": "password123"}).json()
    uid = env["db"]["users"].find_one({"email": "rt6@x.com"})["id"]
    expired = jwt.encode({"sub": "rt6@x.com", "id": uid, "type": "access", "exp": datetime.utcnow() - timedelta(minutes=1)}, SECRET_KEY, algorithm=ALGORITHM)
    assert c.get("/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401
    assert c.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 200


# ---------------------------------------------------------------- stats are real

def test_stats_count_real_activity_streak_and_scores(env):
    from datetime import datetime, timedelta, timezone
    from app.routes import stats as stats_routes
    db = env["db"]
    for name in ["goals_col", "test_results_col", "tests_col", "tutor_lessons_col", "tutor_sessions_col", "tutor_usage_col"]:
        env["mp"].setattr(stats_routes, name, db[name.replace("_col", "")])
    today = datetime.now(timezone.utc)
    day = lambda n: (today - timedelta(days=n))
    db["tutor_usage"].insert_many([{"user_id": "s1", "date": day(n).strftime("%Y-%m-%d"), "count": 3} for n in (0, 1)])
    db["tests"].insert_one({"user_id": "s1", "created_at": day(2).isoformat()})
    db["tests"].insert_one({"user_id": "s1", "created_at": day(5).isoformat()})   # gap at day 3-4: not in the streak
    db["test_results"].insert_many([{"user_id": "s1", "last_score": 80}, {"user_id": "s1", "last_score": 60}])
    db["tutor_usage"].insert_one({"user_id": "someone-else", "date": day(3).strftime("%Y-%m-%d")})
    as_user("s1")
    body = env["client"].get("/stats").json()
    assert body == {"streak": 3, "active_days_week": 4, "avg_score": 70, "tests_taken": 2}


def test_stats_for_a_new_user_are_zero(env):
    from app.routes import stats as stats_routes
    for name in ["goals_col", "test_results_col", "tests_col", "tutor_lessons_col", "tutor_sessions_col", "tutor_usage_col"]:
        env["mp"].setattr(stats_routes, name, env["db"][name.replace("_col", "")])
    as_user("nobody")
    assert env["client"].get("/stats").json() == {"streak": 0, "active_days_week": 0, "avg_score": 0, "tests_taken": 0}


# ---------------------------------------------------------------- id_filter

def test_id_filter_finds_every_stored_id_shape():
    from bson import ObjectId
    from app.database import id_filter
    col = mongomock.MongoClient()["t"]["things"]
    oid = ObjectId()
    col.insert_many([
        {"_id": oid, "id": str(oid), "name": "object-id"},
        {"_id": "legacy-str", "name": "string _id"},
        {"_id": ObjectId(), "id": 42, "name": "int id"},
        {"_id": ObjectId(), "id": "abc", "name": "string id"},
    ])
    assert col.find_one(id_filter(str(oid)))["name"] == "object-id"
    assert col.find_one(id_filter(oid))["name"] == "object-id"
    assert col.find_one(id_filter("legacy-str"))["name"] == "string _id"
    assert col.find_one(id_filter(42))["name"] == "int id"
    assert col.find_one(id_filter("42"))["name"] == "int id"
    assert col.find_one(id_filter("abc"))["name"] == "string id"
    assert col.find_one(id_filter("nope")) is None


def test_id_filter_only_uses_indexed_fields_for_object_ids():
    from bson import ObjectId
    from app.database import id_filter
    f = id_filter(str(ObjectId()))
    fields = {k for clause in f["$or"] for k in clause}
    assert fields <= {"_id", "id"} and len(f["$or"]) == 2
