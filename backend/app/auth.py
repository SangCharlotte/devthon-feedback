"""Care-team login: password hashing, signed session cookies, and who may do what.

Passwords are never stored - only a slow, salted scrypt hash. After a successful
login the browser gets an HttpOnly cookie holding a signed token (a JWT), so
JavaScript on the page can't read it and nobody can forge one without SESSION_SECRET.

Two kinds of account:
- the owner, set in .env (ADMIN_USERNAME / ADMIN_PASSWORD_HASH): always works, so
  the team can never be locked out of its own dashboard;
- staff accounts in the database, created by a manager from the dashboard.
"""

import base64
import getpass
import hashlib
import hmac
import os
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import DbSession
from app.models import Role, StaffUser

COOKIE_NAME = "admin_session"
MIN_SECRET_LENGTH = 32
MIN_PASSWORD_LENGTH = 10
_ALGORITHM = "HS256"
# scrypt cost: 2**14 rounds x 8 blocks = 16 MB of memory per guess, which makes
# brute-forcing a stolen hash expensive while a single login stays ~50 ms.
_N, _R, _P = 2**14, 8, 1


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
    staff_id: int | None = None  # None = the owner account from .env

    @property
    def is_manager(self) -> bool:
        return self.role == Role.MANAGER


def normalize_username(username: str) -> str:
    return username.strip().lower()


def _owner() -> CurrentUser | None:
    settings = get_settings()
    if not settings.admin_password_hash:
        return None
    name = normalize_username(settings.admin_username)
    return CurrentUser(username=name, display_name=name, role=Role.MANAGER)


def _owner_version() -> str:
    # The owner has no database row to bump. Instead the token carries a fingerprint
    # of the password hash: set a new password in .env and old owner sessions die.
    return hashlib.sha256(get_settings().admin_password_hash.encode()).hexdigest()[:16]


def _staff_user(staff: StaffUser) -> CurrentUser:
    return CurrentUser(staff.username, staff.display_name, staff.role, staff.id)


@lru_cache
def _dummy_hash() -> str:
    return hash_password(os.urandom(16).hex())


def authenticate(db: Session, username: str, password: str) -> CurrentUser | None:
    """The account these credentials belong to, or None. Same slow work either way,
    so response timing doesn't reveal which usernames exist."""
    name = normalize_username(username)
    owner = _owner()
    if owner and hmac.compare_digest(name.encode(), owner.username.encode()):
        return owner if verify_password(password, get_settings().admin_password_hash) else None

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
    if user.staff_id is None:
        version: int | str = _owner_version()
    else:
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

    owner = _owner()
    if owner and claims.get("sub") == owner.username:
        if claims.get("ver") == _owner_version():
            return owner
    else:
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


if __name__ == "__main__":
    # docker compose run --rm --no-deps backend python -m app.auth hash-password
    if sys.argv[1:] != ["hash-password"]:
        sys.exit("usage: python -m app.auth hash-password")
    first = getpass.getpass("New admin password: ")
    if len(first) < MIN_PASSWORD_LENGTH:
        sys.exit("Use at least 10 characters.")
    if getpass.getpass("Repeat it: ") != first:
        sys.exit("Passwords didn't match.")
    print(hash_password(first))
