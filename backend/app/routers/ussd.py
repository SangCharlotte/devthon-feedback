"""USSD channel: Africa's Talking calls this once per menu screen of a session."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Form
from fastapi.responses import PlainTextResponse

from app import ussd
from app.database import DbSession
from app.models import Channel, Segment
from app.notifications import notify_detractor
from app.phone import normalize_phone
from app.routers.sms import check_webhook_token
from app.services.ai_tagging import tag_response
from app.services.feedback import get_or_create_customer_by_phone, record_response

router = APIRouter(prefix="/ussd", tags=["ussd"])


@router.post("", response_class=PlainTextResponse)
def ussd_session(
    db: DbSession,
    background: BackgroundTasks,
    phone_number: Annotated[str, Form(alias="phoneNumber")],
    text: Annotated[str, Form()] = "",
    token: str = "",
) -> str:
    """Reply 'CON <screen>' to keep the session open, or 'END <message>' to close it."""
    check_webhook_token(token)
    try:
        phone = normalize_phone(phone_number)
    except ValueError:
        return "END Sorry, we couldn't read your phone number."

    step = ussd.next_step(text)
    if isinstance(step, ussd.Prompt):
        return f"CON {step.text}"

    customer = get_or_create_customer_by_phone(db, phone=phone)
    response, alert = record_response(
        db,
        customer,
        q1=step.q1,
        q2=step.q2,
        q3=step.q3,
        channel=Channel.USSD,
        segment=Segment.PAINTER,  # USSD, like SMS, is the feature-phone channel
        comment=step.comment,
    )
    if alert is not None:
        background.add_task(notify_detractor, alert.id)
    if response.comment:
        background.add_task(tag_response, response.id)
    return f"END {ussd.goodbye(float(response.mean), response.category)}"
