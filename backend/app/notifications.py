"""
Asynchronous notification management module handling alert dispatch matrices
for customer satisfaction score threshold exceptions.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy.orm import joinedload

from app import mailer, sms
from app.config import get_settings
from app.database import SessionLocal
from app.models import Alert, FeedbackResponse

log = logging.getLogger(__name__)


def notify_detractor(alert_id: int) -> None:
    """Dispatches alert notifications via email and SMS configurations.
    Enforces complete exception isolation to prevent third-party gateway 
    failures from interrupting the core transaction flow.
    """
    try:
        _notify(alert_id)
    except Exception:
        log.exception("Detractor notification failed for alert %s", alert_id)


def _notify(alert_id: int) -> None:
    settings = get_settings()
    # Instantiate a scoped database transaction state context for asynchronous worker execution
    with SessionLocal() as db:
        alert = db.get(
            Alert,
            alert_id,
            options=[joinedload(Alert.response).joinedload(FeedbackResponse.customer)],
        )
        if alert is None:
            return
        response = alert.response
        customer = response.customer
        contact = customer.email or customer.phone or "no contact details"

        if mailer.send_email(
            settings.care_team_email,
            subject=f"Detractor alert: {customer.name} scored {response.mean}/5",
            body=_email_body(response),
        ):
            alert.email_sent_at = datetime.now(UTC)

        if settings.care_team_phone and sms.send_sms(
            settings.care_team_phone,
            f"Company X alert: {customer.name} ({contact}) scored {response.mean}/5. "
            "Please follow up.",
        ):
            alert.sms_sent_at = datetime.now(UTC)

        db.commit()


def _email_body(response: FeedbackResponse) -> str:
    customer = response.customer
    return f"""A customer has just left negative feedback and needs a follow-up.

Name:     {customer.name}
Email:    {customer.email or "-"}
Phone:    {customer.phone or "-"}
Channel:  {response.channel}

Average score: {response.mean} / 5
  Product experience:  {response.q1}
  Customer care:       {response.q2}
  Happy with product:  {response.q3}

Comment: {response.comment or "-"}

System Alert: Update operational status to 'Resolved' within the management terminal post-remediation.
"""
