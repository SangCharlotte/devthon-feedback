from datetime import UTC, datetime, timedelta

import jwt
import pytest
from sqlalchemy import select

from app.auth import COOKIE_NAME, hash_password, sync_owner, verify_password
from app.models import Role, StaffUser
from tests.conftest import ADMIN_PASSWORD, ADMIN_USERNAME

LOGIN = {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
OWNER = {
    "username": ADMIN_USERNAME,
    "display_name": ADMIN_USERNAME,
    "role": "manager",
    "is_owner": True,
}
PROTECTED = [
    ("get", "/alerts"),
    ("patch", "/alerts/1"),
    ("get", "/stats"),
    ("get", "/responses"),
    ("post", "/sms/invite"),
    ("get", "/auth/me"),
    ("get", "/ai/status"),
    ("post", "/ai/summary"),
    ("post", "/alerts/1/draft"),
    ("post", "/alerts/1/reply"),
    ("get", "/staff"),
    ("post", "/staff"),
    ("patch", "/staff/1"),
    ("post", "/auth/password"),
]


def test_hash_round_trip():
    stored = hash_password("s3cret-paint")
    assert stored.startswith("scrypt:")
    assert "s3cret-paint" not in stored
    assert verify_password("s3cret-paint", stored)
    assert not verify_password("wrong", stored)


def test_same_password_hashes_differently_each_time():
    # A random salt per hash: two admins with the same password get different hashes.
    assert hash_password("same") != hash_password("same")


@pytest.mark.parametrize("stored", ["", "garbage", "bcrypt:1:2:3:abc:def"])
def test_malformed_hash_never_matches(stored):
    assert not verify_password("anything", stored)


def test_login_sets_httponly_cookie(anon_client):
    response = anon_client.post("/auth/login", json=LOGIN)

    assert response.status_code == 200
    assert response.json() == OWNER
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE_NAME}=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert anon_client.get("/auth/me").json() == OWNER


@pytest.mark.parametrize(
    "body",
    [
        {"username": ADMIN_USERNAME, "password": "wrong password"},
        {"username": "someone-else", "password": ADMIN_PASSWORD},
    ],
)
def test_bad_credentials_get_the_same_401(anon_client, body):
    response = anon_client.post("/auth/login", json=body)
    assert response.status_code == 401
    assert response.json()["detail"] == "Wrong username or password"
    assert "set-cookie" not in response.headers


def test_owner_password_is_stored_hashed_in_the_database(anon_client, db_session):
    owner = db_session.scalar(select(StaffUser).where(StaffUser.username == ADMIN_USERNAME))
    assert owner.role == Role.MANAGER and owner.is_active
    assert ADMIN_PASSWORD not in owner.password_hash
    assert verify_password(ADMIN_PASSWORD, owner.password_hash)


def test_restarting_with_the_same_password_keeps_owner_sessions(client, db_session):
    sync_owner(db_session)
    assert client.get("/auth/me").status_code == 200


def test_owner_login_is_off_without_a_password(client, settings, db_session):
    settings.admin_password = ""  # an empty password must never let anyone in
    sync_owner(db_session)
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/login", json={**LOGIN, "password": ""}).status_code == 401
    assert client.post("/auth/login", json=LOGIN).status_code == 401


def test_changing_the_owner_password_ends_old_owner_sessions(client, settings, db_session):
    settings.admin_password = "a brand new owner password"
    sync_owner(db_session)
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/login", json=LOGIN).status_code == 401
    new_login = {**LOGIN, "password": "a brand new owner password"}
    assert client.post("/auth/login", json=new_login).status_code == 200


def test_login_refuses_a_short_session_secret(anon_client, settings):
    settings.session_secret = "too-short"  # guessable secrets let attackers forge sessions
    assert anon_client.post("/auth/login", json=LOGIN).status_code == 503


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_admin_endpoints_reject_anonymous(anon_client, method, path):
    assert anon_client.request(method, path, json={}).status_code == 401


def test_customer_endpoints_stay_public(anon_client):
    body = {"name": "Ann", "email": "ann@example.com", "phone": "0711000000", "q1": 4, "q2": 4}
    assert anon_client.post("/feedback", json={**body, "q3": 4}).status_code == 201


def test_forged_cookie_is_rejected(anon_client):
    attacker_secret = "an-attackers-own-secret-of-32-bytes!"
    forged = jwt.encode({"sub": ADMIN_USERNAME}, attacker_secret, algorithm="HS256")
    anon_client.cookies.set(COOKIE_NAME, forged)
    assert anon_client.get("/auth/me").status_code == 401


def test_expired_session_is_rejected(anon_client, settings):
    expired = jwt.encode(
        {"sub": ADMIN_USERNAME, "exp": datetime.now(UTC) - timedelta(minutes=1)},
        settings.session_secret,
        algorithm="HS256",
    )
    anon_client.cookies.set(COOKIE_NAME, expired)
    assert anon_client.get("/auth/me").status_code == 401


def test_logout_clears_cookie(client):
    assert client.post("/auth/logout").status_code == 204
    assert client.get("/auth/me").status_code == 401
