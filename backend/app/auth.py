"""Care-team login: password hashing, signed session cookies, and who may do what.

Passwords are never stored - only a slow, salted scrypt hash. After a successful
login the browser gets an HttpOnly cookie holding a signed token (a JWT), so
JavaScript on the page can't read it and nobody can forge one without SESSION_SECRET.

Every account is a row in the staff table. The owner is the one named by
ADMIN_USERNAME / ADMIN_PASSWORD in .env: sync_owner() writes it at startup as an active
manager, so the team can never be locked out of its own dashboard. Managers add the
rest from the dashboard.
"""

import base64
import hashlib
import hmac
import logging
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import DbSession, SessionLocal
from app.models import Role, StaffUser

COOKIE_NAME = "admin_session"
MIN_SECRET_LENGTH = 32
MIN_PASSWORD_LENGTH = 10
_ALGORITHM = "HS256"
# scrypt cost: 2**14 rounds x 8 blocks = 16 MB of memory per guess, which makes
# brute-forcing a stolen hash expensive while a single login stays ~50 ms.
_N, _R, _P = 2**14, 8, 1

log = logging.getLogger(__name__)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    """Return 'scrypt:n:r:p:salt:hash'. Colons, not '$', so .env files don't mangle it."""
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt:{_N}:{_R}:{_P}:{_b64(salt)}:{_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = stored.split(":")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(), salt=_unb64(salt), n=int(n), r=int(r), p=int(p), dklen=32
        )
    except ValueError:
        return False  # empty or malformed hash: nobody can log in
    return hmac.compare_digest(digest, _unb64(expected))


@dataclass(frozen=True)
class CurrentUser:
    username: str
    display_name: str
    role: Role
    staff_id: int

    @property
    def is_manager(self) -> bool:
        return self.role == Role.MANAGER

    @property
    def is_owner(self) -> bool:
        return self.username == owner_username()


def normalize_username(username: str) -> str:
    return username.strip().lower()


def owner_username() -> str:
    return normalize_username(get_settings().admin_username)


def sync_owner(db: Session) -> None:
    """Make the owner's row match .env. Safe to run on every startup.

    A changed ADMIN_PASSWORD is rehashed and bumps session_version, so the owner's old
    sessions end. An empty ADMIN_PASSWORD deactivates the owner: no password, no login.
    """
    password = get_settings().admin_password
    name = owner_username()
    owner = db.scalar(select(StaffUser).where(StaffUser.username == name))
    if not password:
        if owner and owner.is_active:
            owner.is_active = False
            owner.session_version += 1
            db.commit()
        return
    if owner is None:
        owner = StaffUser(username=name, display_name=name, password_hash=hash_password(password))
        db.add(owner)
    elif not verify_password(password, owner.password_hash):
        owner.password_hash = hash_password(password)
        owner.session_version += 1
    owner.role = Role.MANAGER
    owner.is_active = True
    db.commit()


def sync_owner_on_startup() -> None:
    # Log and carry on: /health and the customer questionnaire don't need the owner.
    try:
        with SessionLocal() as db:
            sync_owner(db)
    except Exception:
        log.exception("Could not sync the owner account from .env")


def _staff_user(staff: StaffUser) -> CurrentUser:
    return CurrentUser(staff.username, staff.display_name, staff.role, staff.id)


@lru_cache
def _dummy_hash() -> str:
    return hash_password(os.urandom(16).hex())


def authenticate(db: Session, username: str, password: str) -> CurrentUser | None:
    """The account these credentials belong to, or None. Same slow work either way,
    so response timing doesn't reveal which usernames exist."""
    name = normalize_username(username)
    staff = db.scalar(select(StaffUser).where(StaffUser.username == name))
    if staff is None or not staff.is_active:
        verify_password(password, _dummy_hash())
        return None
    if not verify_password(password, staff.password_hash):
        return None
    staff.last_login_at = datetime.now(UTC)
    return _staff_user(staff)


def create_session_token(user: CurrentUser, db: Session) -> str:
    settings = get_settings()
    version = db.get(StaffUser, user.staff_id).session_version
    expires = datetime.now(UTC) + timedelta(hours=settings.session_hours)
    claims = {"sub": user.username, "ver": version, "exp": expires}
    return jwt.encode(claims, settings.session_secret, _ALGORITHM)


def require_staff(
    db: DbSession,
    token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> CurrentUser:
    """FastAPI dependency: the signed-in person, or 401.

    The token alone isn't enough: we also check the account still exists, is still
    active and hasn't changed password since. That's what makes "deactivate" instant.
    """
    secret = get_settings().session_secret
    if not token or len(secret) < MIN_SECRET_LENGTH:
        raise HTTPException(status_code=401, detail="Not logged in")
    try:
        # decode() checks the signature AND the "exp" expiry claim.
        claims = jwt.decode(token, secret, algorithms=[_ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Session expired, please log in") from exc

    staff = db.scalar(select(StaffUser).where(StaffUser.username == claims.get("sub")))
    if staff and staff.is_active and claims.get("ver") == staff.session_version:
        return _staff_user(staff)
    raise HTTPException(status_code=401, detail="Your session has ended, please log in again")


def require_manager(user: Annotated[CurrentUser, Depends(require_staff)]) -> CurrentUser:
    """Signed in AND allowed to manage the team. 403 = "we know who you are, but no"."""
    if not user.is_manager:
        raise HTTPException(status_code=403, detail="Only a manager can do that")
    return user


Staff = Annotated[CurrentUser, Depends(require_staff)]
Manager = Annotated[CurrentUser, Depends(require_manager)]
