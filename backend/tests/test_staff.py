import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import StaffUser

REP = {
    "username": "Wanjiru.K",
    "display_name": "Wanjiru Kamau",
    "password": "rep-password-123",
    "role": "rep",
}
DETRACTOR = {
    "name": "Otieno",
    "email": "otieno@example.com",
    "phone": "0722000111",
    "q1": 1,
    "q2": 2,
    "q3": 1,
}


@pytest.fixture
def browser(anon_client):
    """Open another browser: its own cookie jar, so several people can be logged in."""
    clients = []

    def open_browser():
        clients.append(TestClient(app).__enter__())
        return clients[-1]

    yield open_browser
    for c in clients:
        c.__exit__(None, None, None)


def log_in(client, username, password):
    response = client.post("/auth/login", json={"username": username, "password": password})
    return response.status_code


@pytest.fixture
def rep(client):
    """The owner (logged in as `client`) adds a care rep."""
    response = client.post("/staff", json=REP)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def rep_browser(rep, browser):
    b = browser()
    assert log_in(b, "wanjiru.k", REP["password"]) == 200
    return b


# --- Adding people ---


def test_manager_adds_a_rep(client, rep):
    assert rep["username"] == "wanjiru.k"  # stored lowercase
    assert rep["role"] == "rep" and rep["is_active"] is True
    assert "password" not in rep and "password_hash" not in rep
    assert {s["username"] for s in client.get("/staff").json()} == {"care-admin", "wanjiru.k"}


def test_password_is_stored_only_as_a_hash(rep, db_session):
    stored = db_session.get(StaffUser, rep["id"]).password_hash
    assert stored.startswith("scrypt:") and REP["password"] not in stored


@pytest.mark.parametrize("username", ["wanjiru.k", "WANJIRU.K", "care-admin"])
def test_usernames_are_unique_including_the_owners(client, rep, username):
    response = client.post("/staff", json={**REP, "username": username})
    assert response.status_code == 409


@pytest.mark.parametrize(
    "change",
    [
        {"username": "has space"},
        {"username": "<script>"},
        {"username": "a"},
        {"password": "short"},
        {"role": "superuser"},
        {"display_name": "  "},
    ],
)
def test_bad_staff_details_are_rejected(client, change):
    assert client.post("/staff", json={**REP, **change}).status_code == 422


# --- What a rep can and can't do ---


def test_a_rep_logs_in_as_themselves(rep_browser, db_session, rep):
    me = rep_browser.get("/auth/me").json()
    assert me == {
        "username": "wanjiru.k",
        "display_name": "Wanjiru Kamau",
        "role": "rep",
        "is_owner": False,
    }
    assert db_session.get(StaffUser, rep["id"]).last_login_at is not None


def test_a_rep_can_use_the_dashboard(rep_browser):
    assert rep_browser.get("/stats").status_code == 200
    assert rep_browser.get("/alerts").status_code == 200


@pytest.mark.parametrize(
    ("method", "path"), [("get", "/staff"), ("post", "/staff"), ("patch", "/staff/1")]
)
def test_a_rep_cannot_manage_the_team(rep_browser, method, path):
    # 403, not 401: logged in, but not allowed.
    assert rep_browser.request(method, path, json=REP).status_code == 403


def test_promotion_takes_effect_without_logging_in_again(client, rep, rep_browser):
    client.patch(f"/staff/{rep['id']}", json={"role": "manager"})
    assert rep_browser.get("/staff").status_code == 200


def test_replies_are_signed_by_the_rep_who_sent_them(client, rep_browser, outbox):
    client.post("/feedback", json=DETRACTOR)
    alert_id = rep_browser.get("/alerts").json()[0]["id"]
    reply = {"subject": "About your paint", "body": "I'll call you today. - Wanjiru"}
    alert = rep_browser.post(f"/alerts/{alert_id}/reply", json=reply).json()
    assert alert["replied_by"] == "wanjiru.k"


# --- Taking access away ---


def test_deactivating_logs_the_rep_out_immediately(client, rep, rep_browser):
    assert client.patch(f"/staff/{rep['id']}", json={"is_active": False}).status_code == 200

    assert rep_browser.get("/stats").status_code == 401  # their open session is dead
    assert log_in(rep_browser, "wanjiru.k", REP["password"]) == 401


def test_reactivating_does_not_revive_old_sessions(client, rep, rep_browser):
    old_cookie = dict(rep_browser.cookies)
    client.patch(f"/staff/{rep['id']}", json={"is_active": False})
    client.patch(f"/staff/{rep['id']}", json={"is_active": True})

    rep_browser.cookies.update(old_cookie)
    assert rep_browser.get("/stats").status_code == 401
    assert log_in(rep_browser, "wanjiru.k", REP["password"]) == 200


def test_manager_password_reset_ends_the_reps_sessions(client, rep, rep_browser):
    client.patch(f"/staff/{rep['id']}", json={"password": "a-new-temporary-pass"})

    assert rep_browser.get("/stats").status_code == 401
    assert log_in(rep_browser, "wanjiru.k", REP["password"]) == 401
    assert log_in(rep_browser, "wanjiru.k", "a-new-temporary-pass") == 200


def test_a_manager_cannot_lock_themselves_out(client, browser):
    boss = client.post("/staff", json={**REP, "username": "amina", "role": "manager"}).json()
    b = browser()
    log_in(b, "amina", REP["password"])
    for change in ({"is_active": False}, {"role": "rep"}):
        assert b.patch(f"/staff/{boss['id']}", json=change).status_code == 400
    assert b.patch(f"/staff/{boss['id']}", json={"display_name": "Amina O."}).status_code == 200


def test_updating_an_unknown_person_is_404(client):
    assert client.patch("/staff/999", json={"is_active": False}).status_code == 404


# --- Changing your own password ---


def test_a_rep_changes_their_own_password(rep, rep_browser, browser):
    phone = browser()  # the same rep, also logged in on their phone
    log_in(phone, "wanjiru.k", REP["password"])
    change = {"current_password": REP["password"], "new_password": "my-own-secret-99"}

    assert rep_browser.post("/auth/password", json=change).status_code == 200

    assert rep_browser.get("/stats").status_code == 200  # this browser stays in
    assert phone.get("/stats").status_code == 401  # every other device is logged out
    assert log_in(phone, "wanjiru.k", REP["password"]) == 401
    assert log_in(phone, "wanjiru.k", "my-own-secret-99") == 200


def test_changing_password_needs_the_current_one(rep_browser):
    change = {"current_password": "not-it", "new_password": "my-own-secret-99"}
    assert rep_browser.post("/auth/password", json=change).status_code == 400


def test_the_owner_password_is_only_changed_in_env(client):
    change = {"current_password": "whatever", "new_password": "my-own-secret-99"}
    response = client.post("/auth/password", json=change)
    assert response.status_code == 400
    assert ".env" in response.json()["detail"]


@pytest.mark.parametrize("change", [{"is_active": False}, {"role": "rep"}, {"password": "x" * 12}])
def test_the_owner_row_is_managed_only_in_env(client, rep, rep_browser, change):
    owner = next(s for s in client.get("/staff").json() if s["username"] == "care-admin")
    assert client.patch(f"/staff/{rep['id']}", json={"role": "manager"}).status_code == 200
    response = rep_browser.patch(f"/staff/{owner['id']}", json=change)
    assert response.status_code == 400
    assert ".env" in response.json()["detail"]


def test_only_the_env_owner_is_flagged_as_owner(client, rep):
    flags = {s["username"]: s["is_owner"] for s in client.get("/staff").json()}
    assert flags == {"care-admin": True, "wanjiru.k": False}
