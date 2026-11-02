"""Pretend to be Africa's Talking delivering a painter's text reply (for local demos).

    docker compose exec backend python -m app.simulate_sms +254712345678 "4 5 4"
    docker compose exec backend python -m app.simulate_sms 0712345678 "1 2 1 the paint peeled"

It sends the same form POST that Africa's Talking sends to /sms/inbound, so the
whole real path runs: token check, parsing, scoring, alert, AI tagging. The webhook
token is read from settings here, inside the container, so it never has to be
typed or shown.
"""

import sys

import httpx

from app.config import get_settings

API = "http://127.0.0.1:8000"


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit('usage: python -m app.simulate_sms <phone> "<reply, e.g. 4 5 4>"')
    phone, text = sys.argv[1], sys.argv[2]
    response = httpx.post(
        f"{API}/sms/inbound",
        params={"token": get_settings().at_webhook_token},
        data={"from": phone, "text": text},
        timeout=10,
    )
    response.raise_for_status()
    status = response.json()["status"]
    print(
        {
            "recorded": f"Recorded {text!r} from {phone}. Check the dashboard.",
            "invalid": f"{text!r} isn't 3 numbers from 1 to 5: the painter gets the help text.",
            "ignored": f"{phone!r} isn't a phone number we understand: ignored.",
        }[status]
    )


if __name__ == "__main__":
    main()
