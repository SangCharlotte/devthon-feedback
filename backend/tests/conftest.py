"""Shared test fixtures.

Database tests run against a separate "<db>_test" database that is built by
running the real Alembic migrations - so the migrations get tested too.
"""

from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app import ai, auth, mailer, notifications, sms
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.routers import auth as auth_router
from app.services import ai_tagging

BACKEND_DIR = Path(__file__).resolve().parent.parent
MAIN_URL = make_url(get_settings().database_url)
TEST_URL = MAIN_URL.set(database=f"{MAIN_URL.database}_test")

ADMIN_USERNAME = "care-admin"
ADMIN_PASSWORD = "correct horse battery"


def _create_test_database() -> None:
    # CREATE DATABASE can't run inside a transaction, hence AUTOCOMMIT.
    admin = create_engine(MAIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": TEST_URL.database}
        )
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{TEST_URL.database}"'))
    admin.dispose()


@pytest.fixture(scope="session")
def alembic_cfg() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.set_main_option(
        "sqlalchemy.url", TEST_URL.render_as_string(hide_password=False).replace("%", "%%")
    )
    return cfg


@pytest.fixture(scope="session")
def engine(alembic_cfg):
    _create_test_database()
    # Up, down, up again: proves every migration can be both applied and reverted.
    command.upgrade(alembic_cfg, "head")
    command.downgrade(alembic_cfg, "base")
    command.upgrade(alembic_cfg, "head")

    test_engine = create_engine(TEST_URL)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def db_session(engine):
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    yield session
    session.close()
    # Wipe all rows so every test starts from an empty database.
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE alerts, responses, customers, staff RESTART IDENTITY CASCADE"))


@pytest.fixture
def settings(monkeypatch):
    """Known settings for every test; monkeypatch restores the originals afterwards."""
    current = get_settings()
    monkeypatch.setattr(current, "care_team_email", "care@companyx.test")
    monkeypatch.setattr(current, "care_team_phone", "")
    monkeypatch.setattr(current, "at_webhook_token", "")
    monkeypatch.setattr(current, "at_ussd_code", "")
    monkeypatch.setattr(current, "admin_username", ADMIN_USERNAME)
    monkeypatch.setattr(current, "admin_password", ADMIN_PASSWORD)
    # Fake value for tests only; marked so the secret scanner knows it was reviewed.
    test_secret = "test-secret-that-is-long-enough-for-hs256"  # gitleaks:allow
    monkeypatch.setattr(current, "session_secret", test_secret)
    monkeypatch.setattr(current, "cookie_secure", False)
    # Never call the real (billed) AI from tests, even if a developer's .env has a key.
    monkeypatch.setattr(current, "ai_api_key", "")
    monkeypatch.setattr(current, "ai_provider", "anthropic")
    monkeypatch.setattr(current, "ai_model", "")
    monkeypatch.setattr(current, "ai_demo_mode", False)
    return current


@pytest.fixture
def outbox(monkeypatch, settings):
    """Replace real email/SMS sending with fakes that record what would have been sent."""
    sent = {"email": [], "sms": []}

    def fake_email(to, subject, body):
        sent["email"].append({"to": to, "subject": subject, "body": body})
        return True

    def fake_sms(to, message):
        sent["sms"].append({"to": to, "message": message})
        return True

    monkeypatch.setattr(mailer, "send_email", fake_email)
    monkeypatch.setattr(sms, "send_sms", fake_sms)
    return sent


@pytest.fixture
def anon_client(db_session, engine, outbox, monkeypatch):
    """A visitor who is not logged in (a customer, or an attacker)."""
    # Background tasks open their own session; point them at the test database too.
    test_sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(notifications, "SessionLocal", test_sessions)
    monkeypatch.setattr(ai_tagging, "SessionLocal", test_sessions)
    monkeypatch.setattr(auth, "SessionLocal", test_sessions)  # startup owner sync
    app.dependency_overrides[get_db] = lambda: db_session
    # Failed-login counters live in memory: start every test with a clean slate.
    auth_router.failures_by_ip.clear()
    auth_router.failures_by_username.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def client(anon_client):
    """Logged in as the admin: the cookie jar keeps the session cookie for later requests."""
    response = anon_client.post(
        "/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return anon_client


class FakeClaude:
    """Stands in for anthropic.Anthropic: records requests, replays queued answers."""

    def __init__(self):
        self.requests = []
        self.answers = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(parse=self._parse))

    def answer(self, parsed_output=None, *, stop_reason="end_turn", error=None):
        self.answers.append((parsed_output, stop_reason, error))

    def _parse(self, **request):
        self.requests.append(request)
        parsed_output, stop_reason, error = self.answers.pop(0)
        if error is not None:
            raise error
        return SimpleNamespace(
            parsed_output=parsed_output, stop_reason=stop_reason, stop_details=None
        )

    def prompt(self, index=-1):
        return self.requests[index]["messages"][0]["content"]


@pytest.fixture
def fake_claude(monkeypatch, settings):
    """AI switched on, but every call goes to a FakeClaude instead of the internet."""
    settings.ai_api_key = "test-key-not-real"  # gitleaks:allow
    claude = FakeClaude()
    monkeypatch.setattr(ai, "_client", lambda api_key, timeout: claude)
    return claude
