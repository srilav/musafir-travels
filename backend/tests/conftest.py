import os

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://musafir:musafir@localhost:5433/musafir_test"
)
# Must be set before the app (and its engine) is imported. Env vars override backend/.env.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = "test-secret-with-at-least-32-bytes!!"
os.environ["AI_ENABLED"] = "false"
os.environ["AI_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.routers.ai import get_rate_limiter  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema():
    with engine.begin() as conn:
        Base.metadata.drop_all(conn)
        conn.execute(text("DROP TYPE IF EXISTS trip_type"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        Base.metadata.create_all(conn)
    yield
    with engine.begin() as conn:
        Base.metadata.drop_all(conn)
        conn.execute(text("DROP TYPE IF EXISTS trip_type"))


@pytest.fixture(autouse=True)
def _clean_state():
    yield
    with engine.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE activities, days, trips, users, knowledge_keywords, knowledge_entries "
                "CASCADE"
            )
        )
    get_rate_limiter().reset()
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def signup(client: TestClient, username: str = "deepak", password: str = "hunter2") -> dict:
    response = client.post("/api/v1/auth/signup", json={"username": username, "password": password})
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def auth_headers(client: TestClient) -> dict:
    return signup(client)
