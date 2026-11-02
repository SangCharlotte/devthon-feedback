import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

log = logging.getLogger(__name__)


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
