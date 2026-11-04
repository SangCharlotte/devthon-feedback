"""Pretend to be Africa's Talking running a USSD session (for local demos).

    docker compose exec backend python -m app.simulate_ussd 0712345678 4 5 4 "great paint"
    docker compose exec backend python -m app.simulate_ussd 0712345678 2 1 2 0

Each answer is one screen, posted to /ussd exactly as Africa's Talking would, with
every answer so far joined by '*'. Prints each screen the phone would show.
"""

import sys
import uuid

import httpx

from app.config import get_settings

API = "http://127.0.0.1:8000"


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit('usage: python -m app.simulate_ussd <phone> [answer ...], e.g. 0712345678 4 5 4 0')
    phone, answers = sys.argv[1], sys.argv[2:]
    session = f"SIM{uuid.uuid4().hex[:12]}"
    for count in range(len(answers) + 1):
        response = httpx.post(
            f"{API}/ussd",
            params={"token": get_settings().at_webhook_token},
            data={
                "sessionId": session,
                "serviceCode": get_settings().at_ussd_code or "*384*0#",
                "phoneNumber": phone,
                "text": "*".join(answers[:count]),
            },
            timeout=10,
        )
        response.raise_for_status()
        print(f"--- screen {count + 1} ---\n{response.text}\n")
        if response.text.startswith("END"):
            break


if __name__ == "__main__":
    main()
