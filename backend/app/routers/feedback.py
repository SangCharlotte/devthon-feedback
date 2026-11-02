from fastapi import APIRouter, BackgroundTasks, status

from app.database import DbSession
from app.models import Channel
from app.notifications import notify_detractor
from app.schemas import FeedbackIn, FeedbackOut
from app.services.ai_tagging import tag_response
from app.services.feedback import get_or_create_customer, record_response

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", status_code=status.HTTP_201_CREATED)
def submit_feedback(payload: FeedbackIn, db: DbSession, background: BackgroundTasks) -> FeedbackOut:
    customer = get_or_create_customer(
        db, name=payload.name, email=payload.email, phone=payload.phone
    )
    response, alert = record_response(
        db,
        customer,
        q1=payload.q1,
        q2=payload.q2,
        q3=payload.q3,
        channel=Channel.WEB,
        comment=payload.comment,
    )
    if alert is not None:
        background.add_task(notify_detractor, alert.id)  # first: the care team can't wait
    if response.comment:
        background.add_task(tag_response, response.id)

    return FeedbackOut(
        id=response.id,
        mean=float(response.mean),
        category=response.category,
        alert_created=alert is not None,
    )
