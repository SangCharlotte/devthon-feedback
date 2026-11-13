from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app import ai, mailer, sms
from app.ai import ReplyDraft
from app.auth import Staff, require_staff
from app.database import DbSession
from app.models import Alert, AlertStatus, FeedbackResponse
from app.schemas import AlertOut, AlertUpdate, DeliveryStatusOut, ReplyIn

# Every route in this router requires a logged-in admin.
router = APIRouter(prefix="/alerts", tags=["alerts"], dependencies=[Depends(require_staff)])

_WITH_CUSTOMER = joinedload(Alert.response).joinedload(FeedbackResponse.customer)


@router.get("")
def list_alerts(
    db: DbSession,
    status: AlertStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[AlertOut]:
    """Detractor alerts for the care-team dashboard, newest first."""
    stmt = (
        select(Alert)
        .options(_WITH_CUSTOMER)
        .order_by(Alert.created_at.desc(), Alert.id.desc())
        .limit(limit)
    )
    if status is not None:
        stmt = stmt.where(Alert.status == status)
    return [AlertOut.from_alert(alert) for alert in db.scalars(stmt)]


@router.get("/delivery")
def delivery_status() -> DeliveryStatusOut:
    """Lets the reply composer warn when emails or SMS won't really reach the customer."""
    return DeliveryStatusOut(email=mailer.delivery_mode(), sms=sms.delivery_mode())


@router.patch("/{alert_id}")
def update_alert(alert_id: int, payload: AlertUpdate, db: DbSession) -> AlertOut:
    """Mark an alert read/unread, or resolved once the care rep has followed up."""
    alert = db.get(Alert, alert_id, options=[_WITH_CUSTOMER])
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    if payload.is_read is not None:
        alert.is_read = payload.is_read
    if payload.status is not None and payload.status != alert.status:
        alert.status = payload.status
        if payload.status is AlertStatus.RESOLVED:
            alert.resolved_at = datetime.now(UTC)
            alert.is_read = True
        else:
            alert.resolved_at = None

    db.commit()
    return AlertOut.from_alert(alert)


def _get_alert(db: DbSession, alert_id: int) -> Alert:
    alert = db.get(Alert, alert_id, options=[_WITH_CUSTOMER])
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.post("/{alert_id}/draft")
def draft_reply(alert_id: int, db: DbSession) -> ReplyDraft:
    """AI suggests a reply. Nothing is sent: the care rep edits it and decides."""
    response = _get_alert(db, alert_id).response
    first_name = response.customer.name.split()[0]
    scores = {
        "product experience": response.q1,
        "customer care": response.q2,
        "happy with product": response.q3,
    }
    try:
        return ai.draft_reply(first_name, scores, response.comment)
    except ai.AIUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"AI draft unavailable: {exc}") from exc


@router.post("/{alert_id}/reply")
def send_reply(alert_id: int, payload: ReplyIn, db: DbSession, user: Staff) -> AlertOut:
    """Send the customer the reply the care rep wrote or approved, and keep a record.

    Email when we have an address; otherwise SMS (feature-phone customers often have no email).
    """
    alert = _get_alert(db, alert_id)
    customer = alert.response.customer
    if customer.email:
        if not mailer.send_email(customer.email, payload.subject, payload.body):
            raise HTTPException(status_code=502, detail="Couldn't send the email, please try again")
    elif customer.phone:
        # SMS has no subject line: only the body goes to the customer.
        if not sms.send_sms(customer.phone, payload.body):
            raise HTTPException(status_code=502, detail="Couldn't send the SMS, please try again")
    else:
        raise HTTPException(
            status_code=422, detail="This customer has no email or phone number on record"
        )

    alert.replied_at = datetime.now(UTC)
    alert.replied_by = user.username  # who sent it, for the audit trail
    alert.reply_subject = payload.subject
    alert.reply_body = payload.body
    alert.is_read = True
    db.commit()
    return AlertOut.from_alert(alert)
