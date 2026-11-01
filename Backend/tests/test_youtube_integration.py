import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.user import User
from app.models.goal import Goal, Step
from app.services.youtube import (
    YouTubeService,
    is_valid_youtube_id,
    extract_youtube_id,
    get_youtube_embed_url,
    should_recommend_video,
    build_search_query,
    youtube_service,
)
from app.utils.dependencies import get_verified_user
from app.main import app

# ── DATABASE & TEST CLIENT SETUP ──────────────────────────────────────────────
TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


mock_user = MagicMock(spec=User)
mock_user.id = 1
mock_user.email = "test@auvon.ai"
mock_user.name = "Test Student"
mock_user.is_verified = True


def override_get_verified_user():
    return mock_user


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_verified_user] = override_get_verified_user

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


# ── 1. VALIDATION TESTS ───────────────────────────────────────────────────────
class TestYouTubeValidation:
    def test_valid_youtube_ids(self):
        assert is_valid_youtube_id("dQw4w9WgXcQ") is True
        assert is_valid_youtube_id("jNQXAC9IVRw") is True
        assert is_valid_youtube_id("_a1-b2_c3-d") is True

    def test_invalid_youtube_ids(self):
        assert is_valid_youtube_id("too_short") is False
        assert is_valid_youtube_id("too_long_for_youtube_id_123") is False
        assert is_valid_youtube_id("contains!bad") is False
        assert is_valid_youtube_id("") is False
        assert is_valid_youtube_id(None) is False

    def test_extract_youtube_id_from_urls(self):
        assert extract_youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
        assert extract_youtube_id("http://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s") == "dQw4w9WgXcQ"
        assert extract_youtube_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
        assert extract_youtube_id("https://www.youtube.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
        assert extract_youtube_id("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
        assert extract_youtube_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
        assert extract_youtube_id("https://vimeo.com/123456") is None

    def test_get_youtube_embed_url(self):
        assert (
            get_youtube_embed_url("dQw4w9WgXcQ")
            == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
        )
        assert (
            get_youtube_embed_url("https://youtu.be/dQw4w9WgXcQ")
            == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
        )
        assert get_youtube_embed_url("invalid_id") is None

    def test_should_recommend_video(self):
        assert should_recommend_video("Watch video tutorial on Docker containers") is True
        assert should_recommend_video("Complete video walkthrough of React components") is True
        assert should_recommend_video("Introduction to neural network architectures") is True
        assert should_recommend_video("Solve 5 algorithmic LeetCode problems in Python") is False


# ── 2. YOUTUBE SERVICE & RETRIEVAL TESTS ─────────────────────────────────────
class TestYouTubeService:
    def test_search_fallback_when_api_key_missing(self):
        service = YouTubeService()
        with patch.object(service, "get_api_key", return_value=None):
            results = service.search_videos("React Hooks tutorial")
            assert len(results) == 1
            item = results[0]
            assert item["type"] == "search"
            assert item["verified"] is False
            assert item["id"] is None
            assert item["video_id"] is None
            assert "youtube.com/results?search_query=" in item["url"]
            assert "React+Hooks+tutorial" in item["url"]

    def test_search_with_youtube_data_api_success(self):
        service = YouTubeService()
        mock_api_response = {
            "items": [
                {
                    "id": {"videoId": "M7lc1UVf-VE"},
                    "snippet": {
                        "title": "YouTube API Tutorial &amp; Guide",
                        "description": "Learn the YouTube Data API v3 step by step.",
                        "thumbnails": {
                            "high": {"url": "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg"}
                        },
                        "channelTitle": "Google Developers",
                    },
                }
            ]
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_api_response

        with patch.object(service, "get_api_key", return_value="AIzaFakeKey123"):
            with patch.object(service._session, "get", return_value=mock_resp):
                results = service.search_videos("YouTube API guide")
                assert len(results) == 1
                video = results[0]
                assert video["type"] == "video"
                assert video["verified"] is True
                assert video["id"] == "M7lc1UVf-VE"
                assert video["title"] == "YouTube API Tutorial & Guide"
                assert video["embed_url"] == "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE"
                assert video["thumbnail"] == "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg"
                assert video["channel_title"] == "Google Developers"

    def test_search_handles_quota_exceeded_gracefully(self):
        service = YouTubeService()
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.text = '{"error": {"errors": [{"reason": "quotaExceeded"}]}}'

        with patch.object(service, "get_api_key", return_value="AIzaExhaustedKey"):
            with patch.object(service._session, "get", return_value=mock_resp):
                results = service.search_videos("PostgreSQL index tuning")
                assert len(results) == 1
                item = results[0]
                assert item["type"] == "search"
                assert item["verified"] is False
                assert item["id"] is None
                assert "youtube.com/results" in item["url"]

    def test_caching_prevents_duplicate_api_calls(self):
        service = YouTubeService()
        mock_api_response = {
            "items": [
                {
                    "id": {"videoId": "dQw4w9WgXcQ"},
                    "snippet": {
                        "title": "Test Video Title",
                        "description": "Description",
                        "thumbnails": {"default": {"url": "https://img.test"}},
                        "channelTitle": "Channel",
                    },
                }
            ]
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_api_response

        with patch.object(service, "get_api_key", return_value="AIzaFakeKey"):
            with patch.object(service._session, "get", return_value=mock_resp) as mock_get:
                first = service.search_videos("cached query test")
                second = service.search_videos("cached query test")
                assert first == second
                assert mock_get.call_count == 1  # Called only once due to cache

    def test_get_video_details_oembed(self):
        service = YouTubeService()
        mock_oembed_data = {
            "title": "Learn FastAPI in 1 Hour",
            "author_name": "Tech Tutorials",
            "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_oembed_data

        with patch.object(service._session, "get", return_value=mock_resp):
            details = service.get_video_details("dQw4w9WgXcQ")
            assert details["valid"] is True
            assert details["embeddable"] is True
            assert details["title"] == "Learn FastAPI in 1 Hour"
            assert details["channel_title"] == "Tech Tutorials"
            assert details["embed_url"] == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"


# ── 3. API ROUTE & ROADMAP INTEGRATION TESTS ─────────────────────────────────
class TestVideoRoutesAndGoals:
    def test_get_video_details_endpoint_valid_id(self):
        with patch.object(youtube_service, "get_video_details") as mock_details:
            mock_details.return_value = {
                "id": "dQw4w9WgXcQ",
                "video_id": "dQw4w9WgXcQ",
                "title": "Python Async Programming",
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "embed_url": "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
                "thumbnail": "https://img.test",
                "type": "video",
                "valid": True,
                "embeddable": True,
                "verified": True,
            }

            resp = client.get("/videos/dQw4w9WgXcQ")
            assert resp.status_code == 200
            data = resp.json()
            assert data["id"] == "dQw4w9WgXcQ"
            assert data["title"] == "Python Async Programming"
            assert data["embed_url"] == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"

    def test_get_video_details_endpoint_invalid_id(self):
        resp = client.get("/videos/invalid_short_id")
        assert resp.status_code == 400
        assert "Invalid YouTube video ID" in resp.json()["detail"]

    def test_goals_with_and_without_videos(self):
        db = TestingSessionLocal()
        # Create a goal with steps
        goal = Goal(title="Master Docker", user_id=1, created_at="2026-11-01T10:00:00")
        db.add(goal)
        db.commit()
        db.refresh(goal)

        # Step 1: without videos (existing legacy step backward compatibility)
        step_legacy = Step(
            goal_id=goal.id,
            description="Install Docker Desktop and CLI",
            week=1,
            is_completed=1,
            videos=None,
        )
        # Step 2: with verified video
        step_with_video = Step(
            goal_id=goal.id,
            description="Watch Docker crash course tutorial",
            week=1,
            is_completed=0,
            videos=[
                {
                    "id": "fqMOX6JJhGo",
                    "video_id": "fqMOX6JJhGo",
                    "title": "Docker in 100 Seconds",
                    "url": "https://www.youtube.com/watch?v=fqMOX6JJhGo",
                    "embed_url": "https://www.youtube-nocookie.com/embed/fqMOX6JJhGo",
                    "thumbnail": "https://i.ytimg.com/vi/fqMOX6JJhGo/hqdefault.jpg",
                    "channel_title": "Fireship",
                    "type": "video",
                    "verified": True,
                }
            ],
        )
        db.add(step_legacy)
        db.add(step_with_video)
        db.commit()
        db.close()

        resp = client.get("/goals")
        assert resp.status_code == 200
        goals_data = resp.json()
        assert len(goals_data) == 1
        retrieved_goal = goals_data[0]
        assert retrieved_goal["title"] == "Master Docker"
        week1_steps = retrieved_goal["weeks"]["1"]
        assert len(week1_steps) == 2

        # Verify step without videos returns empty list for compatibility
        assert week1_steps[0]["videos"] == []

        # Verify step with video returns verified video card structure
        assert len(week1_steps[1]["videos"]) == 1
        video = week1_steps[1]["videos"][0]
        assert video["id"] == "fqMOX6JJhGo"
        assert video["type"] == "video"
        assert video["verified"] is True
        assert video["title"] == "Docker in 100 Seconds"

    def test_create_goal_ai_stores_video_metadata(self):
        mock_plan = [
            {
                "week": 1,
                "steps": [
                    {
                        "text": "Watch Docker architecture deep dive tutorial",
                        "video_query": "Docker architecture explained",
                    },
                    {
                        "text": "Build a Dockerfile for Python application",
                        "video_query": None,
                    },
                ],
            }
        ]

        with patch("app.routes.goals.generate_plan", return_value=mock_plan):
            with patch.object(youtube_service, "search_videos") as mock_search:
                mock_search.return_value = [
                    {
                        "id": "pTFZFxd4hOI",
                        "video_id": "pTFZFxd4hOI",
                        "title": "Docker Tutorial for Beginners",
                        "url": "https://www.youtube.com/watch?v=pTFZFxd4hOI",
                        "embed_url": "https://www.youtube-nocookie.com/embed/pTFZFxd4hOI",
                        "thumbnail": "https://img.test/thumb.jpg",
                        "channel_title": "TechWorld with Nana",
                        "type": "video",
                        "verified": True,
                    }
                ]

                resp = client.post("/goals/ai?title=Learn+Containerization&weeks=1")
                assert resp.status_code == 200

                # Verify goal was created in database with video
                db = TestingSessionLocal()
                created_goal = db.query(Goal).filter(Goal.title == "Learn Containerization").first()
                assert created_goal is not None
                assert len(created_goal.steps) == 2
                assert len(created_goal.steps[0].videos) == 1
                assert created_goal.steps[0].videos[0]["id"] == "pTFZFxd4hOI"
                db.close()

    def test_refresh_step_videos_endpoint(self):
        db = TestingSessionLocal()
        goal = Goal(title="Web Development", user_id=1, created_at="2026-11-01T10:00:00")
        db.add(goal)
        db.commit()
        db.refresh(goal)

        step = Step(
            goal_id=goal.id,
            description="Learn CSS Grid and Flexbox layouts",
            week=1,
            is_completed=0,
            videos=[],
        )
        db.add(step)
        db.commit()
        db.refresh(step)
        step_id = step.id
        db.close()

        with patch.object(youtube_service, "search_videos") as mock_search:
            mock_search.return_value = [
                {
                    "id": "rg7Fvvl3taU",
                    "video_id": "rg7Fvvl3taU",
                    "title": "CSS Grid Tutorial",
                    "url": "https://www.youtube.com/watch?v=rg7Fvvl3taU",
                    "embed_url": "https://www.youtube-nocookie.com/embed/rg7Fvvl3taU",
                    "thumbnail": "https://img.test/grid.jpg",
                    "channel_title": "Web Dev Simplified",
                    "type": "video",
                    "verified": True,
                }
            ]

            resp = client.post(f"/steps/{step_id}/videos/refresh")
            assert resp.status_code == 200
            data = resp.json()
            assert data["step_id"] == step_id
            assert len(data["videos"]) == 1
            assert data["videos"][0]["id"] == "rg7Fvvl3taU"


# ── 4. COMPLETE LEARNING WORKSPACE, NOTES & QUIZ GENERATION TESTS ─────────────
class TestVideoLearningWorkflow:
    def test_get_single_goal_workspace(self):
        db = TestingSessionLocal()
        goal = Goal(title="Learn Fullstack AI", user_id=1, created_at="2026-11-01T10:00:00")
        db.add(goal)
        db.commit()
        db.refresh(goal)

        step = Step(
            goal_id=goal.id,
            description="Build a FastAPI endpoint",
            week=1,
            is_completed=0,
            videos=[
                {
                    "id": "dQw4w9WgXcQ",
                    "title": "FastAPI Crash Course",
                    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    "embed_url": "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
                    "thumbnail": "https://img.test/fastapi.jpg",
                    "channel_title": "FastAPI Team",
                    "type": "video",
                    "verified": True,
                }
            ],
        )
        db.add(step)
        db.commit()
        goal_id = goal.id
        db.close()

        resp = client.get(f"/goals/{goal_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == goal_id
        assert data["title"] == "Learn Fullstack AI"
        assert "1" in data["weeks"]
        assert len(data["weeks"]["1"]) == 1
        assert data["weeks"]["1"][0]["text"] == "Build a FastAPI endpoint"
        assert len(data["weeks"]["1"][0]["videos"]) == 1
        assert data["weeks"]["1"][0]["videos"][0]["id"] == "dQw4w9WgXcQ"

    def test_get_single_goal_not_found(self):
        resp = client.get("/goals/999999")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Goal not found"

    def test_get_video_transcript_status_available(self):
        with patch.object(youtube_service, "get_video_transcript") as mock_transcript:
            mock_transcript.return_value = {
                "video_id": "dQw4w9WgXcQ",
                "available": True,
                "snippets_count": 42,
                "char_count": 1250,
                "source": "youtube_subtitles",
                "text": "Welcome to this lesson on asynchronous programming in Python.",
            }

            resp = client.get("/videos/dQw4w9WgXcQ/transcript")
            assert resp.status_code == 200
            data = resp.json()
            assert data["video_id"] == "dQw4w9WgXcQ"
            assert data["available"] is True
            assert data["snippets_count"] == 42
            assert "Welcome to this lesson" in data["preview"]

    def test_get_video_transcript_status_unavailable(self):
        with patch.object(youtube_service, "get_video_transcript") as mock_transcript:
            mock_transcript.return_value = {
                "video_id": "dQw4w9WgXcQ",
                "available": False,
                "snippets_count": 0,
                "char_count": 0,
                "source": "error",
                "message": "Captions disabled",
                "text": None,
            }

            resp = client.get("/videos/dQw4w9WgXcQ/transcript")
            assert resp.status_code == 200
            data = resp.json()
            assert data["available"] is False
            assert data["message"] == "Captions disabled"
            assert data["preview"] is None

    def test_generate_notes_direct_gemini_success(self):
        """Verify that direct Gemini video understanding generates notes when captions are unavailable."""
        with patch.object(youtube_service, "get_video_transcript") as mock_transcript:
            mock_transcript.return_value = {"video_id": "abc123xyz89", "available": False, "text": None}
            with patch.object(youtube_service, "get_video_details") as mock_details:
                mock_details.return_value = {
                    "id": "abc123xyz89",
                    "title": "Machine Learning Overview",
                    "channel_title": "AI Academy",
                }
                with patch("app.routes.videos.generate_notes_from_youtube_direct") as mock_direct_notes:
                    mock_direct_notes.return_value = (
                        "# Machine Learning Overview\n\n"
                        "## 📌 Overview & Scope\nCore ML architectures and algorithms.\n\n"
                        "## 🔑 Key Concepts & Definitions\n- **Supervised Learning**: Model learns from labels.\n\n"
                        "## 🎯 Key Takeaways\n- Generalization is key."
                    )
                    with patch("app.routes.videos.embed_and_store_note_chunks"):
                        resp = client.post(
                            "/videos/abc123xyz89/notes",
                            json={"title": "Machine Learning Overview", "force_refresh": True},
                        )
                        assert resp.status_code == 200
                        data = resp.json()
                        assert "note_id" in data
                        assert data["note"]["title"] == "Notes: Machine Learning Overview"
                        assert "Supervised Learning" in data["note"]["content"]

                        # Verify saved in database
                        from app.models.notes import Notes, UserNotes
                        db = TestingSessionLocal()
                        saved_note = db.query(Notes).filter(Notes.id == data["note_id"]).first()
                        assert saved_note is not None
                        assert saved_note.source == "video"
                        user_note = db.query(UserNotes).filter(UserNotes.note_id == data["note_id"]).first()
                        assert user_note is not None
                        assert user_note.user_id == 1
                        db.close()

    def test_generate_notes_from_spoken_transcript_fast_path(self):
        """Verify that when spoken captions exist, fast path generates notes in seconds without multi-minute transcoding."""
        with patch.object(youtube_service, "get_video_transcript") as mock_transcript:
            mock_transcript.return_value = {
                "video_id": "fallback123",
                "available": True,
                "snippets_count": 10,
                "char_count": 500,
                "text": "In this video we cover key principles of software architecture.",
            }
            with patch.object(youtube_service, "get_video_details") as mock_details:
                mock_details.return_value = {
                    "id": "fallback123",
                    "title": "Software Architecture Fundamentals",
                    "channel_title": "Arch Mastery",
                }
                with patch("app.routes.videos.generate_ai_notes") as mock_gen_notes:
                    mock_gen_notes.return_value = "# Software Architecture\n\n- Modular design\n- Loose coupling"
                    with patch("app.routes.videos.embed_and_store_note_chunks"):
                        resp = client.post(
                            "/videos/fallback123/notes",
                            json={"title": "Software Architecture Fundamentals", "force_refresh": True},
                        )
                        assert resp.status_code == 200
                        data = resp.json()
                        assert "note_id" in data
                        assert "Modular design" in data["note"]["content"]

    def test_generate_notes_from_video_with_custom_transcript(self):
        """Verify that user-supplied transcript skips automated analysis."""
        with patch.object(youtube_service, "get_video_details") as mock_details:
            mock_details.return_value = {"id": "custom12345", "title": "Custom Lecture"}
            with patch("app.routes.videos.generate_ai_notes") as mock_gen_notes:
                mock_gen_notes.return_value = "# Custom Notes\n\nDerived from student input."
                with patch("app.routes.videos.embed_and_store_note_chunks"):
                    resp = client.post(
                        "/videos/custom12345/notes",
                        json={
                            "title": "Custom Lecture",
                            "custom_transcript": "This is user supplied transcript text of the video lecture.",
                        },
                    )
                    assert resp.status_code == 200
                    data = resp.json()
                    assert "note_id" in data
                    assert "Derived from student input." in data["note"]["content"]

    def test_generate_notes_fails_without_transcript_or_direct(self):
        """Verify that when both direct processing and captions fail, 422 explains the actual failure."""
        with patch.object(youtube_service, "get_video_transcript") as mock_transcript:
            mock_transcript.return_value = {
                "video_id": "failnote123",
                "available": False,
                "text": None,
                "message": "No subtitles found",
            }
            with patch("app.routes.videos.generate_notes_from_youtube_direct", side_effect=ValueError("Token count exceeds 1M")):
                with patch.object(youtube_service, "get_video_details") as mock_details:
                    mock_details.return_value = {"id": "failnote123", "title": "Silent Video"}
                    resp = client.post(
                        "/videos/failnote123/notes",
                        json={"title": "Silent Video", "force_refresh": True},
                    )
                    assert resp.status_code == 422
                    detail = resp.json()["detail"]
                    assert "too long for direct AI video processing" in detail
                    assert "paste notes or a transcript below" in detail

    def test_generate_quiz_direct_gemini_success(self):
        """Verify direct Gemini video processing generates structured quiz questions when captions unavailable."""
        with patch.object(youtube_service, "get_video_transcript") as mock_transcript:
            mock_transcript.return_value = {"video_id": "quizvid1234", "available": False, "text": None}
            with patch.object(youtube_service, "get_video_details") as mock_details:
                mock_details.return_value = {"id": "quizvid1234", "title": "Kubernetes Architecture"}
                mock_questions = [
                    {
                        "question": "What is the control plane in Kubernetes?",
                        "options": ["Option A: Worker Node", "Option B: Master components", "Option C: Docker engine", "Option D: Ingress controller"],
                        "correct_answer": "Option B: Master components",
                        "explanation": "Master components manage the cluster state.",
                    },
                    {
                        "question": "Which component schedules pods onto nodes?",
                        "options": ["Option A: kube-scheduler", "Option B: kubelet", "Option C: etcd", "Option D: kube-proxy"],
                        "correct_answer": "Option A: kube-scheduler",
                        "explanation": "kube-scheduler assigns unassigned pods to nodes.",
                    },
                ]
                with patch("app.routes.videos.generate_quiz_from_youtube_direct", return_value=mock_questions):
                    resp = client.post(
                        "/videos/quizvid1234/quiz",
                        json={"num_questions": 2, "difficulty": "easy", "force_refresh": True},
                    )
                    assert resp.status_code == 200
                    data = resp.json()
                    assert "test_id" in data
                    assert len(data["questions"]) == 2
                    assert data["questions"][0]["question"] == "What is the control plane in Kubernetes?"

                    # Verify saved in database
                    from app.models.test import Test, Question
                    db = TestingSessionLocal()
                    saved_test = db.query(Test).filter(Test.id == data["test_id"]).first()
                    assert saved_test is not None
                    assert saved_test.user_id == 1
                    saved_qs = db.query(Question).filter(Question.test_id == data["test_id"]).all()
                    assert len(saved_qs) == 2
                    assert saved_qs[0].correct_answer == "Option B: Master components"
                    db.close()

    def test_generate_quiz_from_spoken_transcript_fast_path(self):
        """Verify quiz generation uses fast spoken transcript path when captions are present."""
        with patch.object(youtube_service, "get_video_transcript") as mock_transcript:
            mock_transcript.return_value = {
                "video_id": "quizfall123",
                "available": True,
                "text": "FastAPI is a modern, fast web framework for building APIs with Python.",
            }
            with patch.object(youtube_service, "get_video_details") as mock_details:
                mock_details.return_value = {"id": "quizfall123", "title": "FastAPI Intro"}
                mock_questions = [
                    {
                        "question": "What language is FastAPI built with?",
                        "options": ["Option A: Python", "Option B: JavaScript", "Option C: Go", "Option D: Rust"],
                        "correct_answer": "Option A: Python",
                    }
                ]
                with patch("app.routes.videos.generate_questions", return_value=mock_questions):
                    resp = client.post(
                        "/videos/quizfall123/quiz",
                        json={"num_questions": 1, "difficulty": "easy", "force_refresh": True},
                    )
                    assert resp.status_code == 200
                    data = resp.json()
                    assert len(data["questions"]) == 1

    def test_generate_quiz_from_video_with_custom_transcript(self):
        """Verify custom transcript skips direct video processing."""
        with patch.object(youtube_service, "get_video_details") as mock_details:
            mock_details.return_value = {"id": "tsquiz12345", "title": "TypeScript Basics"}
            mock_questions = [
                {
                    "question": "What is TypeScript?",
                    "options": ["Option A: Typed superset of JS", "Option B: Python linter", "Option C: CSS framework", "Option D: Database"],
                    "correct_answer": "Option A: Typed superset of JS",
                }
            ]
            with patch("app.routes.videos.generate_questions", return_value=mock_questions):
                resp = client.post(
                    "/videos/tsquiz12345/quiz",
                    json={
                        "num_questions": 1,
                        "difficulty": "medium",
                        "custom_transcript": "TypeScript is a strongly typed programming language that builds on JavaScript.",
                    },
                )
                assert resp.status_code == 200
                data = resp.json()
                assert len(data["questions"]) == 1

    def test_generate_quiz_fails_without_transcript_or_direct(self):
        """Verify 422 with clear diagnostic message when direct and transcript fail."""
        with patch("app.routes.videos.generate_quiz_from_youtube_direct", side_effect=RuntimeError("Quota exceeded 429")):
            with patch.object(youtube_service, "get_video_transcript") as mock_transcript:
                mock_transcript.return_value = {
                    "video_id": "failquiz123",
                    "available": False,
                    "text": None,
                    "message": "Captions disabled by creator",
                }
                with patch.object(youtube_service, "get_video_details") as mock_details:
                    mock_details.return_value = {"id": "failquiz123", "title": "Subtitles Disabled Video"}
                    resp = client.post(
                        "/videos/failquiz123/quiz",
                        json={"num_questions": 3, "difficulty": "easy", "force_refresh": True},
                    )
                    assert resp.status_code == 422
                    detail = resp.json()["detail"]
                    assert "quota or rate limit" in detail
                    assert "paste notes or a transcript below" in detail

    def test_cached_notes_returned_without_re_generation(self):
        """Verify that requesting notes for a recently processed video returns the cached note."""
        with patch.object(youtube_service, "get_video_details") as mock_details:
            mock_details.return_value = {"id": "cachedvid01", "title": "Cached Architecture Video"}
            with patch("app.routes.videos.generate_notes_from_youtube_direct") as mock_direct:
                mock_direct.return_value = "# Cached Architecture Notes\n\n- System Design"
                with patch("app.routes.videos.embed_and_store_note_chunks"):
                    # First call generates note
                    r1 = client.post("/videos/cachedvid01/notes", json={"title": "Cached Architecture Video"})
                    assert r1.status_code == 200
                    note_id_1 = r1.json()["note_id"]

                    # Second call without force_refresh returns cached note
                    r2 = client.post("/videos/cachedvid01/notes", json={"title": "Cached Architecture Video"})
                    assert r2.status_code == 200
                    assert r2.json()["note_id"] == note_id_1
                    assert r2.json().get("cached") is True
                    # mock_direct should only have been called once!
                    assert mock_direct.call_count == 1

    def test_notes_and_quiz_duplicate_lock_prevention(self):
        """Verify that concurrent requests for the same video acquire and release locks."""
        from app.routes.videos import _check_and_acquire_lock, _release_lock

        test_key = "test_user_lock:vid123:notes"
        # First acquire should succeed
        assert _check_and_acquire_lock(test_key) is True
        # Immediate duplicate acquire should be rejected
        assert _check_and_acquire_lock(test_key) is False

        # Release and verify it can be re-acquired
        _release_lock(test_key)
        assert _check_and_acquire_lock(test_key) is True
        _release_lock(test_key)

    def test_build_video_failure_detail_classifications(self):
        """Verify error message classifier distinguishes token limits, quotas, timeouts, and restrictions."""
        from app.routes.videos import _build_video_failure_detail

        # Token limit exceeded
        msg1 = _build_video_failure_detail("Input token count exceeds maximum allowed", "Captions off")
        assert "too long for direct AI video processing" in msg1

        # Quota exceeded
        msg2 = _build_video_failure_detail("Daily quota exhausted on gemini-2.5-flash", "No captions")
        assert "quota or rate limit was reached" in msg2

        # Timeout
        msg3 = _build_video_failure_detail("Connection timed out after 120s", None)
        assert "temporary network timeout" in msg3

        # Private video
        msg4 = _build_video_failure_detail("Video is private or restricted (404)", None)
        assert "private, restricted, or inaccessible" in msg4

    def test_build_search_query_cleaning(self):
        query = build_search_query(
            "AppSec",
            "Deploy OWASP Juice Shop using Docker ('docker run -d -p 3000:3000') and solve challenges."
        )
        assert "docker run" not in query
        assert "AppSec" in query
        assert "Deploy OWASP Juice Shop" in query
        assert query.endswith("tutorial")

    def test_videos_search_endpoint_not_shadowed(self):
        with patch.object(youtube_service, "search_videos") as mock_search:
            mock_search.return_value = [
                {
                    "id": "dQw4w9WgXcQ",
                    "title": "Never Gonna Give You Up",
                    "channel_title": "Rick Astley",
                    "type": "video",
                    "verified": True,
                }
            ]
            resp = client.get("/videos/search?q=Python+programming")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["id"] == "dQw4w9WgXcQ"

    def test_refresh_goal_videos_endpoint(self):
        db = TestingSessionLocal()
        goal = Goal(title="Kubernetes Basics", user_id=1, created_at="2026-11-01T10:00:00")
        db.add(goal)
        db.commit()
        db.refresh(goal)

        s1 = Step(goal_id=goal.id, description="Install Minikube", week=1, is_completed=0, videos=[])
        s2 = Step(goal_id=goal.id, description="Deploy a Pod", week=1, is_completed=0, videos=[])
        db.add(s1)
        db.add(s2)
        db.commit()
        db.refresh(s1)
        s1_id = s1.id
        goal_id = goal.id
        db.close()

        with patch.object(youtube_service, "search_videos") as mock_search:
            mock_search.return_value = [
                {
                    "id": "abc123xyz89",
                    "title": "Kubernetes Video",
                    "type": "video",
                    "verified": True,
                }
            ]
            resp = client.post(f"/goals/{goal_id}/videos/refresh")
            assert resp.status_code == 200
            data = resp.json()
            assert data["goal_id"] == goal_id
            assert len(data["refreshed"]) == 2

            # Verify saved in db
            db = TestingSessionLocal()
            refreshed_s1 = db.query(Step).filter(Step.id == s1_id).first()
            assert refreshed_s1.videos[0]["id"] == "abc123xyz89"
            db.close()

    def test_get_goal_auto_upgrades_search_fallbacks(self):
        db = TestingSessionLocal()
        goal = Goal(title="Docker Advanced", user_id=1, created_at="2026-11-01T10:00:00")
        db.add(goal)
        db.commit()
        db.refresh(goal)

        step = Step(
            goal_id=goal.id,
            description="Watch tutorial on Docker compose multi-container orchestration",
            week=1,
            is_completed=0,
            videos=[
                {
                    "id": None,
                    "title": "Search Tutorials: Docker compose",
                    "type": "search",
                    "verified": False,
                }
            ],
        )
        db.add(step)
        db.commit()
        goal_id = goal.id
        step_id = step.id
        db.close()

        with patch.object(youtube_service, "is_configured", return_value=True):
            with patch.object(youtube_service, "search_videos") as mock_search:
                mock_search.return_value = [
                    {
                        "id": "compose12345",
                        "title": "Docker Compose in 15 Minutes",
                        "type": "video",
                        "verified": True,
                    }
                ]
                resp = client.get(f"/goals/{goal_id}")
                assert resp.status_code == 200
                data = resp.json()
                step_videos = data["weeks"]["1"][0]["videos"]
                assert len(step_videos) == 1
                assert step_videos[0]["id"] == "compose12345"
                assert step_videos[0]["verified"] is True

                # Check persisted to DB
                db = TestingSessionLocal()
                updated_step = db.query(Step).filter(Step.id == step_id).first()
                assert updated_step.videos[0]["id"] == "compose12345"
                db.close()

    def test_resolve_best_resources_matches_official_docs(self):
        from app.services.resources import resolve_best_resources
        # OWASP Top 10
        r_owasp = resolve_best_resources("AppSec", "Study the OWASP Top 10 web vulnerabilities")
        assert len(r_owasp) == 1
        assert r_owasp[0]["type"] == "doc"
        assert "owasp.org" in r_owasp[0]["url"]

        # Semgrep Docs
        r_semgrep = resolve_best_resources("AppSec", "Learn how to write custom pattern-matching rules using Semgrep")
        assert len(r_semgrep) == 1
        assert r_semgrep[0]["type"] == "doc"
        assert "semgrep.dev" in r_semgrep[0]["url"]

        # GitHub Actions Docs
        r_gh = resolve_best_resources("DevOps", "Construct a complete GitHub Actions workflow file")
        assert len(r_gh) == 1
        assert r_gh[0]["type"] == "doc"
        assert "docs.github.com" in r_gh[0]["url"]

    def test_resolve_best_resources_matches_interactive_labs_and_tools(self):
        from app.services.resources import resolve_best_resources
        # PortSwigger Academy Labs
        r_ps = resolve_best_resources("AppSec", "Complete 6 practical labs on PortSwigger Web Security Academy")
        assert len(r_ps) == 1
        assert r_ps[0]["type"] == "lab"
        assert "portswigger.net" in r_ps[0]["url"]

        # OWASP Juice Shop Lab
        r_juice = resolve_best_resources("AppSec", "Deploy OWASP Juice Shop using Docker and solve challenges")
        assert len(r_juice) == 1
        assert r_juice[0]["type"] == "lab"
        assert "owasp.org" in r_juice[0]["url"]

        # Gitleaks Repo
        r_git = resolve_best_resources("AppSec", "Study DevSecOps concepts and secrets detection using Gitleaks")
        assert len(r_git) == 1
        assert r_git[0]["type"] == "repo"
        assert "github.com/gitleaks" in r_git[0]["url"]

    def test_resolve_best_resources_provides_video_when_requested(self):
        from app.services.resources import resolve_best_resources
        with patch.object(youtube_service, "search_videos") as mock_search:
            mock_search.return_value = [
                {
                    "id": "vid12345678",
                    "title": "STRIDE Threat Modeling Walkthrough",
                    "type": "video",
                    "verified": True,
                }
            ]
            r_vid = resolve_best_resources("AppSec", "Watch video walkthrough on STRIDE Threat Modeling")
            assert len(r_vid) == 1
            assert r_vid[0]["type"] == "video"
            assert r_vid[0]["id"] == "vid12345678"



