import pytest
from sqlalchemy import func, select

from app import mailer
from app.models import FeedbackResponse

DETRACTOR = {
    "name": "Otieno Odhiambo",
    "email": "otieno@example.com",
    "phone": "0722 000 111",
    "q1": 2,
    "q2": 3,
    "q3": 2,
    "comment": "Paint peeled after a week",
}


def test_detractor_emails_care_team_with_contact_details(client, outbox):
    client.post("/feedback", json=DETRACTOR)

    assert len(outbox["email"]) == 1
    email = outbox["email"][0]
    assert email["to"] == "care@companyx.test"
    assert "Otieno Odhiambo" in email["subject"]
    assert "2.33" in email["subject"]
    assert "otieno@example.com" in email["body"]
    assert "+254722000111" in email["body"]
    assert "Paint peeled after a week" in email["body"]

    alert = client.get("/alerts").json()[0]
    assert alert["email_sent_at"] is not None
    assert alert["sms_sent_at"] is None  # no CARE_TEAM_PHONE configured


def test_promoter_sends_no_email(client, outbox):
    client.post("/feedback", json={**DETRACTOR, "q1": 5, "q2": 5, "q3": 5})
    assert outbox["email"] == []


def test_care_team_also_gets_sms_when_phone_configured(client, outbox, settings):
    settings.care_team_phone = "+254700000001"
    client.post("/feedback", json=DETRACTOR)

    assert outbox["sms"][0]["to"] == "+254700000001"
    assert "Otieno Odhiambo" in outbox["sms"][0]["message"]
    assert client.get("/alerts").json()[0]["sms_sent_at"] is not None


def test_feedback_is_saved_even_when_email_crashes(client, db_session, monkeypatch):
    def broken_email(*args, **kwargs):
        raise RuntimeError("mail server on fire")

    monkeypatch.setattr(mailer, "send_email", broken_email)
    response = client.post("/feedback", json=DETRACTOR)

    assert response.status_code == 201
    assert db_session.scalar(select(func.count()).select_from(FeedbackResponse)) == 1
    assert client.get("/alerts").json()[0]["email_sent_at"] is None


def test_resolve_alert(client):
    client.post("/feedback", json=DETRACTOR)
    alert_id = client.get("/alerts").json()[0]["id"]

    resolved = client.patch(f"/alerts/{alert_id}", json={"status": "resolved"}).json()
    assert resolved["status"] == "resolved"
    assert resolved["resolved_at"] is not None
    assert resolved["is_read"] is True
    assert client.get("/alerts", params={"status": "open"}).json() == []

    reopened = client.patch(f"/alerts/{alert_id}", json={"status": "open"}).json()
    assert reopened["resolved_at"] is None


def test_mark_alert_read(client):
    client.post("/feedback", json=DETRACTOR)
    alert_id = client.get("/alerts").json()[0]["id"]

    updated = client.patch(f"/alerts/{alert_id}", json={"is_read": True}).json()
    assert updated["is_read"] is True
    assert updated["status"] == "open"


def test_update_missing_alert_returns_404(client):
    assert client.patch("/alerts/999", json={"is_read": True}).status_code == 404


def test_send_email_returns_false_when_server_unreachable(monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "127.0.0.1")
    monkeypatch.setattr(settings, "smtp_port", 1)  # nothing listens on port 1
    monkeypatch.setattr(settings, "smtp_starttls", False)

    assert mailer.send_email("care@companyx.test", "subject", "body") is False


@pytest.mark.parametrize(
    ("host", "expected"),
    [("mailpit", "test"), ("localhost", "test"), ("", "off"), ("smtp.example.com", "live")],
)
def test_delivery_status_flags_test_mail_servers(client, settings, monkeypatch, host, expected):
    # Mailpit accepts every email and delivers none: the composer must warn the rep.
    monkeypatch.setattr(settings, "smtp_host", host)
    assert client.get("/alerts/delivery").json()["email"] == expected


@pytest.mark.parametrize(
    ("username", "key", "expected"),
    [("sandbox", "k", "sandbox"), ("companyx", "k", "live"), ("companyx", "", "off")],
)
def test_delivery_status_flags_sms_sandbox(client, settings, monkeypatch, username, key, expected):
    monkeypatch.setattr(settings, "at_username", username)
    monkeypatch.setattr(settings, "at_api_key", key)
    assert client.get("/alerts/delivery").json()["sms"] == expected
