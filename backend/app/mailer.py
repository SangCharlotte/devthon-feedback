import logging
import smtplib
from email.message import EmailMessage
from typing import Literal

from app.config import get_settings

log = logging.getLogger(__name__)

# Local catch-all servers: they accept every email and deliver none of it.
TEST_SMTP_HOSTS = {"mailpit", "mailhog", "localhost", "127.0.0.1", "::1"}

DeliveryMode = Literal["live", "test", "off"]


def delivery_mode() -> DeliveryMode:
    """'test' means emails are caught locally (e.g. Mailpit) and never reach customers."""
    host = get_settings().smtp_host.strip().lower()
    if not host:
        return "off"
    return "test" if host in TEST_SMTP_HOSTS else "live"


def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Returns False (never raises) if unconfigured or it fails."""
    settings = get_settings()
    if not (settings.smtp_host and to):
        log.warning("Email not sent: SMTP_HOST or recipient is not configured")
        return False

    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except OSError:  # covers smtplib.SMTPException, DNS failures, refused connections
        log.exception("Failed to send email to %s", to)
        return False
    return True
