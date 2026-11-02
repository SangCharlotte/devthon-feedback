import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ratelimit import FailureLimiter
from app.routers import auth as auth_router
from tests.conftest import ADMIN_PASSWORD, ADMIN_USERNAME

LOGIN = {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
WRONG = {"username": ADMIN_USERNAME, "password": "guess"}


class FakeClock:
    """Time that only moves when the test says so: no real waiting."""

    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


@pytest.fixture
def clock(monkeypatch):
    fake = FakeClock()
    monkeypatch.setattr(auth_router.failures_by_ip, "_clock", fake)
    monkeypatch.setattr(auth_router.failures_by_username, "_clock", fake)
    return fake


@pytest.fixture
def via_proxy(anon_client):
    """Requests arriving the way real ones do: from the Next.js container, which
    passes the visitor's IP along in X-Forwarded-For."""
    with TestClient(app, client=("172.18.0.5", 40000)) as proxied:
        yield proxied


def visitor(ip):
    return {"headers": {"X-Forwarded-For": ip}}


def fail_logins(client, times, **kwargs):
    for _ in range(times):
        assert client.post("/auth/login", json=WRONG, **kwargs).status_code == 401


# --- The limiter on its own ---


def test_limiter_blocks_after_the_limit_and_forgets_old_failures():
    clock = FakeClock()
    limiter = FailureLimiter(limit=3, window_seconds=60, clock=clock)
    for _ in range(3):
        assert limiter.retry_after("ip") == 0
        limiter.record_failure("ip")
    assert limiter.retry_after("ip") == 60

    clock.now += 45
    assert limiter.retry_after("ip") == 15  # counts down
    clock.now += 15
    assert limiter.retry_after("ip") == 0  # the oldest failure expired


def test_limiter_keys_are_independent_and_reset_clears_one():
    limiter = FailureLimiter(limit=1, window_seconds=60, clock=FakeClock())
    limiter.record_failure("a")
    limiter.record_failure("b")
    limiter.reset("a")
    assert limiter.retry_after("a") == 0
    assert limiter.retry_after("b") == 60


def test_limiter_does_not_keep_expired_keys_forever():
    clock = FakeClock()
    limiter = FailureLimiter(limit=5, window_seconds=60, clock=clock)
    limiter.record_failure("once")
    clock.now += 61
    limiter.retry_after("once")
    assert "once" not in limiter._failures


# --- The login endpoint ---


def test_five_wrong_passwords_lock_the_login(anon_client, clock):
    fail_logins(anon_client, 5)

    response = anon_client.post("/auth/login", json=WRONG)
    assert response.status_code == 429
    assert response.json()["detail"] == "Too many failed logins. Try again in 15 minutes."
    assert response.headers["retry-after"] == "900"


def test_while_locked_even_the_right_password_is_refused(anon_client, clock):
    # Otherwise a blocked guesser could still learn when a guess was right.
    fail_logins(anon_client, 5)
    response = anon_client.post("/auth/login", json=LOGIN)
    assert response.status_code == 429
    assert "set-cookie" not in response.headers


def test_the_lock_lifts_after_the_window(anon_client, clock):
    fail_logins(anon_client, 5)
    clock.now += 15 * 60
    assert anon_client.post("/auth/login", json=LOGIN).status_code == 200


def test_a_successful_login_clears_earlier_typos(anon_client, clock):
    fail_logins(anon_client, 4)
    assert anon_client.post("/auth/login", json=LOGIN).status_code == 200
    fail_logins(anon_client, 4)  # would be 8 in a row without the reset
    assert anon_client.post("/auth/login", json=LOGIN).status_code == 200


def test_one_attackers_ip_does_not_lock_out_other_visitors(via_proxy, clock):
    fail_logins(via_proxy, 5, **visitor("203.0.113.9"))
    assert via_proxy.post("/auth/login", json=WRONG, **visitor("203.0.113.9")).status_code == 429

    # Same proxy, different visitor: the care rep can still log in.
    assert via_proxy.post("/auth/login", json=LOGIN, **visitor("198.51.100.7")).status_code == 200


def test_a_forged_forwarded_header_is_ignored_from_untrusted_senders(anon_client, clock):
    # Someone reaching the API directly can't dodge the limit by inventing a new IP
    # each time: only our own proxies are believed.
    for n in range(5):
        fail_logins(anon_client, 1, **visitor(f"203.0.113.{n}"))
    assert anon_client.post("/auth/login", json=LOGIN, **visitor("192.0.2.1")).status_code == 429


def test_many_ips_guessing_one_username_are_stopped_too(via_proxy, clock):
    # A botnet: 4 tries each from 5 IPs stays under the per-IP limit...
    for n in range(5):
        fail_logins(via_proxy, 4, **visitor(f"203.0.113.{n}"))
    # ...but 20 failures for one username locks that username, whatever the IP.
    assert via_proxy.post("/auth/login", json=LOGIN, **visitor("192.0.2.1")).status_code == 429


def test_username_matching_ignores_case_and_spaces(via_proxy, clock):
    guess = {"username": f"  {ADMIN_USERNAME.upper()} ", "password": "guess"}
    for n in range(20):
        response = via_proxy.post("/auth/login", json=guess, **visitor(f"203.0.113.{n}"))
        assert response.status_code == 401
    assert via_proxy.post("/auth/login", json=LOGIN, **visitor("192.0.2.1")).status_code == 429
