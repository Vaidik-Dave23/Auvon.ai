import os

# Tests swap collections for mongomock; let app.database import without a real MongoDB.
os.environ.setdefault("ALLOW_MOCK_DB", "1")
# Throwaway signing key for tests only (real deployments set SECRET_KEY in the environment).
os.environ.setdefault("SECRET_KEY", "test-only-secret-not-used-anywhere-else")
os.environ.setdefault("ALGORITHM", "HS256")
