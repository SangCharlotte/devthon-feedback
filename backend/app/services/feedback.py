"""Business logic for saving feedback. Used by the web form now and the SMS webhook later."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Alert, Channel, Customer, FeedbackResponse, Segment
from app.scoring import score_answers


def get_or_create_customer(db: Session, *, name: str, email: str, phone: str) -> Customer:
    """Returning customers are matched by email; their name/phone are refreshed."""
    email = email.lower()
    customer = db.scalar(select(Customer).where(Customer.email == email))
    if customer is None:
        customer = Customer(email=email)
        db.add(customer)
    customer.name = name
    customer.phone = phone
    return customer


def get_or_create_customer_by_phone(
    db: Session, *, phone: str, name: str | None = None
) -> Customer:
    """SMS customers are matched by phone (feature-phone users may have no email)."""
    customer = db.scalar(
        select(Customer).where(Customer.phone == phone).order_by(Customer.id.desc()).limit(1)
    )
    if customer is None:
        customer = Customer(phone=phone, name=name or "SMS customer", segment=Segment.PAINTER)
        db.add(customer)
    elif name:
        customer.name = name
    return customer


def record_response(
    db: Session,
    customer: Customer,
    *,
    q1: int,
    q2: int,
    q3: int,
    channel: Channel,
    segment: Segment,
    comment: str | None = None,
) -> tuple[FeedbackResponse, Alert | None]:
    """Score the answers, save the response, and open an alert for detractors.

    The customer's segment follows their latest answer.

    Everything is committed in one transaction: either all rows are saved or none are.
    """
    result = score_answers(q1, q2, q3)
    customer.segment = segment
    response = FeedbackResponse(
        customer=customer,
        q1=q1,
        q2=q2,
        q3=q3,
        mean=Decimal(str(result.mean)),
        category=result.category,
        channel=channel,
        comment=comment or None,
    )
    db.add(response)

    alert = None
    if result.needs_alert:
        alert = Alert(response=response)
        db.add(alert)

    db.commit()
    return response, alert
