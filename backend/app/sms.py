"""Africa's Talking SMS: sending messages and parsing "4 5 4" replies from feature phones."""

import logging
import re
from typing import Literal

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

SANDBOX_URL = "https://api.sandbox.africastalking.com/version1/messaging"
LIVE_URL = "https://api.africastalking.com/version1/messaging"

# Three ratings 1-5 separated by spaces or commas, optionally followed by a comment.
_REPLY = re.compile(r"\s*([1-5])[\s,]+([1-5])[\s,]+([1-5])(?:\s+(\S.*?))?\s*", re.DOTALL)


def delivery_mode() -> Literal["live", "sandbox", "off"]:
    """'sandbox' means Africa's Talking accepts the SMS but never delivers it to a real phone."""
    settings = get_settings()
    if not settings.at_api_key:
        return "off"
    return "sandbox" if settings.at_username == "sandbox" else "live"


def send_sms(to: str, message: str) -> bool:
    """Send one SMS. Returns False (never raises) if unconfigured or it fails."""
    settings = get_settings()
    if not settings.at_api_key:
        log.warning("SMS not sent: AT_API_KEY is not configured")
        return False

    url = SANDBOX_URL if settings.at_username == "sandbox" else LIVE_URL
    data = {"username": settings.at_username, "to": to, "message": message}
    if settings.at_sender_id:
        data["from"] = settings.at_sender_id

    try:
        response = httpx.post(
            url,
            data=data,
            headers={"apiKey": settings.at_api_key, "Accept": "application/json"},
            timeout=10,
        )
        response.raise_for_status()
        recipients = response.json()["SMSMessageData"]["Recipients"]
    except (httpx.HTTPError, ValueError, KeyError):
        log.exception("Failed to send SMS to %s", to)
        return False

    if not recipients or any(r.get("status") != "Success" for r in recipients):
        log.warning("SMS to %s was rejected: %s", to, recipients)
        return False
    return True


def parse_reply(text: str) -> tuple[int, int, int, str | None]:
    """Parse '4 5 4' (or '4,5,4 great paint') into (q1, q2, q3, comment)."""
    match = _REPLY.fullmatch(text)
    if match is None:
        raise ValueError("Expected three ratings from 1 to 5, e.g. '4 5 4'")
    q1, q2, q3, comment = match.groups()
    return int(q1), int(q2), int(q3), comment
