import math

from fastapi import APIRouter, HTTPException, Request, Response

from app.auth import (
    COOKIE_NAME,
    MIN_SECRET_LENGTH,
    CurrentUser,
    Staff,
    authenticate,
    create_session_token,
    hash_password,
    normalize_username,
    verify_password,
)
from app.config import get_settings
from app.database import DbSession
from app.models import StaffUser
from app.ratelimit import FailureLimiter
from app.schemas import LoginIn, MeOut, PasswordChangeIn

router = APIRouter(prefix="/auth", tags=["auth"])

# Brute-force protection. Per IP: one person mistyping won't hit 5 in 15 minutes,
# a guessing script will. Per username: catches a script that keeps changing IP,
# set higher so an attacker can't easily lock the real admin out.
WINDOW_SECONDS = 15 * 60
failures_by_ip = FailureLimiter(limit=5, window_seconds=WINDOW_SECONDS)
failures_by_username = FailureLimiter(limit=20, window_seconds=WINDOW_SECONDS)


def _too_many_attempts(wait_seconds: int) -> HTTPException:
    minutes = math.ceil(wait_seconds / 60)
    unit = "minute" if minutes == 1 else "minutes"
    return HTTPException(
        status_code=429,
        detail=f"Too many failed logins. Try again in {minutes} {unit}.",
        headers={"Retry-After": str(wait_seconds)},  # standard header: when to come back
    )


@router.post("/login")
def login(payload: LoginIn, request: Request, response: Response, db: DbSession) -> MeOut:
    settings = get_settings()
    # The visitor's real IP, even behind Next.js and Caddy (see ProxyHeadersMiddleware in main.py).
    ip = request.client.host if request.client else "unknown"
    username = normalize_username(payload.username)

    # HS256 needs a secret of at least 32 bytes, or a stolen token could be brute-forced.
    if len(settings.session_secret) < MIN_SECRET_LENGTH:
        raise HTTPException(status_code=503, detail="Admin login is not configured")

    # Check the limit BEFORE the password: a blocked guesser learns nothing,
    # not even whether this guess would have been right.
    wait = max(failures_by_ip.retry_after(ip), failures_by_username.retry_after(username))
    if wait:
        raise _too_many_attempts(wait)

    user = authenticate(db, payload.username, payload.password)
    if user is None:
        failures_by_ip.record_failure(ip)
        failures_by_username.record_failure(username)
        # Same message for wrong username or wrong password: don't help guessers.
        raise HTTPException(status_code=401, detail="Wrong username or password")

    failures_by_ip.reset(ip)  # a successful login wipes that visitor's slate
    db.commit()  # saves last_login_at
    _set_session_cookie(response, user, db)
    return MeOut.from_user(user)


def _set_session_cookie(response: Response, user: CurrentUser, db: DbSession) -> None:
    settings = get_settings()
    response.set_cookie(
        COOKIE_NAME,
        create_session_token(user, db),
        max_age=settings.session_hours * 3600,
        httponly=True,  # invisible to JavaScript, so an XSS bug can't steal it
        samesite="lax",  # not sent on cross-site POST/PATCH: blocks CSRF
        secure=settings.cookie_secure,  # HTTPS-only outside local dev
        path="/",
    )


@router.post("/logout", status_code=204)
def logout(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


@router.get("/me")
def me(user: Staff) -> MeOut:
    return MeOut.from_user(user)


@router.post("/password")
def change_password(
    payload: PasswordChangeIn, user: Staff, db: DbSession, response: Response
) -> MeOut:
    """Change your own password. Logs you out everywhere else, keeps this browser in."""
    if user.staff_id is None:
        raise HTTPException(
            status_code=400,
            detail="The owner password is set in the server's .env file, not here",
        )
    staff = db.get(StaffUser, user.staff_id)
    if not verify_password(payload.current_password, staff.password_hash):
        raise HTTPException(status_code=400, detail="Your current password is wrong")
    staff.password_hash = hash_password(payload.new_password)
    staff.session_version += 1  # every other device's token is now stale
    db.commit()
    _set_session_cookie(response, user, db)  # a fresh token for this browser
    return MeOut.from_user(user)
