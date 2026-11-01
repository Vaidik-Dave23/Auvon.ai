import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from app.main import app
from app.database import Base, get_db
from app.models.user import User
from app.utils.token import hash_password, create_access_token

# Dedicated SQLite test database for auth tests
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_google_auth.db"
test_engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous_overrides)


class TestGoogleOAuthFlow:
    """Tests covering Google OAuth ID token verification, auto-signup, login, and token refresh."""

    def test_google_auth_new_user_success(self, client, db_session):
        mock_claims = {
            "iss": "https://accounts.google.com",
            "email": "new.user@gmail.com",
            "email_verified": True,
            "name": "Jane Google",
            "picture": "https://lh3.googleusercontent.com/test-pic",
            "sub": "google-uid-12345",
        }

        with patch("app.routes.auth.id_token.verify_oauth2_token", return_value=mock_claims):
            response = client.post("/auth/google", json={"credential": "valid.mock.google.id.token"})

        assert response.status_code == 200, response.text
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["is_verified"] is True
        assert data["user"]["email"] == "new.user@gmail.com"
        assert data["user"]["name"] == "Jane Google"

        # Verify user is persisted in the database
        db_user = db_session.query(User).filter(User.email == "new.user@gmail.com").first()
        assert db_user is not None
        assert db_user.is_verified is True
        assert db_user.name == "Jane Google"

    def test_google_auth_existing_user_login(self, client, db_session):
        # Create user beforehand without email verification
        existing_user = User(
            name="Existing Bob",
            email="existing.bob@gmail.com",
            password=hash_password("SuperSecret123!"),
            is_verified=False,
            created_at=datetime.utcnow()
        )
        db_session.add(existing_user)
        db_session.commit()
        db_session.refresh(existing_user)

        mock_claims = {
            "iss": "accounts.google.com",
            "email": "existing.bob@gmail.com",
            "email_verified": True,
            "name": "Bob Updated",
            "sub": "google-uid-67890",
        }

        with patch("app.routes.auth.id_token.verify_oauth2_token", return_value=mock_claims):
            response = client.post("/auth/google", json={"credential": "mock.token.bob"})

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["is_verified"] is True
        assert data["user"]["email"] == "existing.bob@gmail.com"

        # User's is_verified flag should now be True after Google sign-in
        db_session.refresh(existing_user)
        assert existing_user.is_verified is True

    def test_google_login_alias_endpoint(self, client):
        mock_claims = {
            "iss": "https://accounts.google.com",
            "email": "alias.user@gmail.com",
            "email_verified": True,
            "name": "Alias User",
            "sub": "google-uid-alias",
        }

        with patch("app.routes.auth.id_token.verify_oauth2_token", return_value=mock_claims):
            response = client.post("/login/google", json={"credential": "mock.alias.token"})

        assert response.status_code == 200
        data = response.json()
        assert data["user"]["email"] == "alias.user@gmail.com"

    def test_google_auth_unverified_email_rejected(self, client):
        mock_claims = {
            "iss": "https://accounts.google.com",
            "email": "unverified@gmail.com",
            "email_verified": False,
            "name": "Unverified User",
        }

        with patch("app.routes.auth.id_token.verify_oauth2_token", return_value=mock_claims):
            response = client.post("/auth/google", json={"credential": "unverified.mock.token"})

        assert response.status_code == 400
        assert "not verified" in response.json()["detail"].lower()

    def test_google_auth_invalid_issuer_rejected(self, client):
        mock_claims = {
            "iss": "https://evil-issuer.com",
            "email": "attacker@example.com",
            "email_verified": True,
        }

        with patch("app.routes.auth.id_token.verify_oauth2_token", return_value=mock_claims):
            response = client.post("/auth/google", json={"credential": "evil.token"})

        assert response.status_code == 401
        assert "issuer" in response.json()["detail"].lower()

    def test_google_auth_invalid_token_rejected(self, client):
        with patch("app.routes.auth.id_token.verify_oauth2_token", side_effect=ValueError("Token expired")):
            response = client.post("/auth/google", json={"credential": "expired.token"})

        assert response.status_code == 401
        assert "invalid google token" in response.json()["detail"].lower()

    def test_google_auth_missing_credential_rejected(self, client):
        response = client.post("/auth/google", json={"credential": ""})
        assert response.status_code == 400
        assert "missing google authentication credential" in response.json()["detail"].lower()

    def test_token_refresh_flow(self, client, db_session):
        user = User(
            name="Session User",
            email="session.user@gmail.com",
            password=hash_password("pw123456"),
            is_verified=True,
            created_at=datetime.utcnow()
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        initial_token = create_access_token(data={"sub": user.email, "id": user.id})

        # Test POST /auth/refresh
        response = client.post(
            "/auth/refresh",
            headers={"Authorization": f"Bearer {initial_token}"}
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["is_verified"] is True

        # Test POST /refresh alias
        response_alias = client.post(
            "/refresh",
            headers={"Authorization": f"Bearer {initial_token}"}
        )
        assert response_alias.status_code == 200
        assert "access_token" in response_alias.json()

    def test_token_refresh_unauthorized_fails(self, client):
        response = client.post("/auth/refresh")
        assert response.status_code == 401
