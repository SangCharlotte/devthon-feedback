"""SMS channel for painters on feature phones (no app, no data bundle needed)."""

import secrets
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException

from app import sms
from app.auth import Staff
from app.config import get_settings
from app.database import DbSession
from app.models import Channel
from app.notifications import notify_detractor
from app.phone import normalize_phone
from app.schemas import SmsInviteIn, SmsInviteOut
from app.services.ai_tagging import tag_response
from app.services.feedback import get_or_create_customer_by_phone, record_response

router = APIRouter(prefix="/sms", tags=["sms"])

# Keep each message under 160 characters: longer texts are billed as several SMS.
INVITE_TEXT = (
    "Hi {name}! Company X wants your feedback. Rate 1-5: our product, customer care, "
    "your happiness. Reply with 3 numbers, e.g. 4 5 4"
)
HELP_TEXT = "Sorry, we couldn't read that. Reply with 3 numbers from 1 to 5, e.g. 4 5 4"
THANKS_TEXT = "Thank you for your feedback! - Company X"


@router.post("/invite")
def send_invite(payload: SmsInviteIn, db: DbSession, _user: Staff) -> SmsInviteOut:
    """Text a painter a feedback invite. Called from the admin dashboard."""
    customer = get_or_create_customer_by_phone(db, phone=payload.phone, name=payload.name)
    db.commit()
    sent = sms.send_sms(customer.phone, INVITE_TEXT.format(name=customer.name))
    return SmsInviteOut(customer_id=customer.id, sent=sent)


@router.post("/inbound")
def receive_sms(
    db: DbSession,
    background: BackgroundTasks,
    sender: Annotated[str, Form(alias="from")],
    text: Annotated[str, Form()] = "",
    token: str = "",
) -> dict[str, str]:
    """Webhook that Africa's Talking calls when someone replies to our shortcode."""
    expected = get_settings().at_webhook_token
    if expected and not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=403, detail="Invalid webhook token")

    try:
        phone = normalize_phone(sender)
    except ValueError:
        return {"status": "ignored"}

    try:
        q1, q2, q3, comment = sms.parse_reply(text)
    except ValueError:
        background.add_task(sms.send_sms, phone, HELP_TEXT)
        return {"status": "invalid"}

    customer = get_or_create_customer_by_phone(db, phone=phone)
    response, alert = record_response(
        db, customer, q1=q1, q2=q2, q3=q3, channel=Channel.SMS, comment=comment
    )
    background.add_task(sms.send_sms, phone, THANKS_TEXT)
    if alert is not None:
        background.add_task(notify_detractor, alert.id)
    if response.comment:
        background.add_task(tag_response, response.id)
    return {"status": "recorded"}
