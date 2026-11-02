"""Team management: managers add care reps, change roles, reset passwords, deactivate.

There is no delete. A rep who leaves is deactivated: they can't log in any more,
but their name stays on the replies they sent (the audit trail).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.auth import Manager, hash_password, normalize_username, require_manager
from app.config import get_settings
from app.database import DbSession
from app.models import Role, StaffUser
from app.schemas import StaffIn, StaffOut, StaffUpdate

router = APIRouter(prefix="/staff", tags=["staff"], dependencies=[Depends(require_manager)])

USERNAME_TAKEN = "That username is already taken"


def _get_staff(db: DbSession, staff_id: int) -> StaffUser:
    staff = db.get(StaffUser, staff_id)
    if staff is None:
        raise HTTPException(status_code=404, detail="No such team member")
    return staff


@router.get("")
def list_staff(db: DbSession) -> list[StaffOut]:
    query = select(StaffUser).order_by(StaffUser.is_active.desc(), StaffUser.display_name)
    return [StaffOut.model_validate(s) for s in db.scalars(query)]


@router.post("", status_code=201)
def add_staff(payload: StaffIn, db: DbSession) -> StaffOut:
    # The owner's name (from .env) is reserved: one name, one person.
    if payload.username == normalize_username(get_settings().admin_username):
        raise HTTPException(status_code=409, detail=USERNAME_TAKEN)
    staff = StaffUser(
        username=payload.username,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(staff)
    try:
        db.commit()
    except IntegrityError as exc:
        # The UNIQUE constraint is the real guard: it also catches two managers
        # adding the same name at the same moment.
        db.rollback()
        raise HTTPException(status_code=409, detail=USERNAME_TAKEN) from exc
    return StaffOut.model_validate(staff)


@router.patch("/{staff_id}")
def update_staff(staff_id: int, change: StaffUpdate, db: DbSession, manager: Manager) -> StaffOut:
    staff = _get_staff(db, staff_id)
    if staff.id == manager.staff_id and (
        change.is_active is False or change.role not in (None, Role.MANAGER)
    ):
        # Otherwise a manager could lock themselves out by accident.
        raise HTTPException(status_code=400, detail="You can't deactivate or demote yourself")

    if change.display_name is not None:
        staff.display_name = change.display_name
    if change.role is not None:
        staff.role = change.role
    if change.password is not None:
        staff.password_hash = hash_password(change.password)
        staff.session_version += 1  # a reset password logs them out everywhere
    if change.is_active is not None and change.is_active != staff.is_active:
        staff.is_active = change.is_active
        # Also bumped on deactivation, so re-activating later can't revive old sessions.
        staff.session_version += 1
    db.commit()
    return StaffOut.model_validate(staff)
