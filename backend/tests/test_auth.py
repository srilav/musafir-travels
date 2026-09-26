from datetime import UTC, datetime, timedelta

import jwt

from tests.conftest import signup


def test_signup_returns_token_and_logs_in(client):
    response = client.post(
        "/api/v1/auth/signup", json={"username": "deepak", "password": "hunter2"}
    )
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"access_token", "token_type", "expires_in", "username"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 2592000
    assert body["username"] == "deepak"
    trips = client.get("/api/v1/trips", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert trips.status_code == 200


def test_signup_duplicate_username_is_400(client):
    signup(client)
    response = client.post("/api/v1/auth/signup", json={"username": "deepak", "password": "x"})
    assert response.status_code == 400
    assert response.json() == {"detail": "Username already taken"}


def test_login_success_and_failure(client):
    signup(client)
    ok = client.post("/api/v1/auth/login", json={"username": "deepak", "password": "hunter2"})
    assert ok.status_code == 200
    assert ok.json()["username"] == "deepak"
    bad = client.post("/api/v1/auth/login", json={"username": "deepak", "password": "wrong"})
    assert bad.status_code == 401
    unknown = client.post("/api/v1/auth/login", json={"username": "nobody", "password": "x"})
    assert unknown.status_code == 401


def test_login_missing_fields_is_422(client):
    response = client.post("/api/v1/auth/login", json={"username": "deepak"})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)


def test_protected_route_requires_valid_token(client):
    assert client.get("/api/v1/trips").status_code == 401
    garbage = client.get("/api/v1/trips", headers={"Authorization": "Bearer not-a-jwt"})
    assert garbage.status_code == 401
    expired = jwt.encode(
        {"sub": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "exp": datetime.now(UTC) - timedelta(1)},
        "test-secret-with-at-least-32-bytes!!",
        algorithm="HS256",
    )
    response = client.get("/api/v1/trips", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


def test_health_is_public(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_cors_wildcard_origins():
    from app.config import Settings

    settings = Settings(ALLOWED_ORIGINS="https://musafir.vercel.app, https://*.vercel.app")
    assert settings.allowed_origins == ["https://musafir.vercel.app"]
    import re

    pattern = re.compile(settings.allowed_origin_regex)
    assert pattern.fullmatch("https://musafir-git-main-deepak.vercel.app")
    assert not pattern.fullmatch("https://evil.com/.vercel.app")
    assert not pattern.fullmatch("https://a.b.vercel.app")
    assert Settings(ALLOWED_ORIGINS="http://localhost:5173").allowed_origin_regex is None
