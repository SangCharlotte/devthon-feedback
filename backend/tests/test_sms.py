import httpx
import pytest
from sqlalchemy import select

from app import sms
from app.models import Channel, Customer, FeedbackResponse
from app.routers.sms import HELP_TEXT, INVITE_TEXT, THANKS_TEXT

# --- Parsing replies -------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("4 5 4", (4, 5, 4, None)),
        ("  4   5 4 \n", (4, 5, 4, None)),
        ("4,5,4", (4, 5, 4, None)),
        ("2 1 2 paint peeled", (2, 1, 2, "paint peeled")),
    ],
)
def test_parse_reply(text, expected):
    assert sms.parse_reply(text) == expected


@pytest.mark.parametrize("text", ["", "454", "4 5", "6 5 4", "0 5 4", "four five four", "4 5 45"])
def test_parse_reply_rejects(text):
    with pytest.raises(ValueError):
        sms.parse_reply(text)


def test_invite_fits_in_one_sms():
    assert len(INVITE_TEXT.format(name="Mwangi Kariuki")) <= 160


# --- Sending via Africa's Talking -----------------------------------------


def _fake_post(status_code, payload):
    def fake(url, **kwargs):
        return httpx.Response(status_code, json=payload, request=httpx.Request("POST", url))

    return fake


def test_send_sms_success(monkeypatch, settings):
    monkeypatch.setattr(settings, "at_api_key", "test-key")
    ok = {"SMSMessageData": {"Recipients": [{"status": "Success", "number": "+254712345678"}]}}
    monkeypatch.setattr(httpx, "post", _fake_post(201, ok))
    assert sms.send_sms("+254712345678", "hi") is True


def test_send_sms_rejected_recipient(monkeypatch, settings):
    monkeypatch.setattr(settings, "at_api_key", "test-key")
    bad = {"SMSMessageData": {"Recipients": [{"status": "InvalidPhoneNumber"}]}}
    monkeypatch.setattr(httpx, "post", _fake_post(201, bad))
    assert sms.send_sms("+254712345678", "hi") is False


def test_send_sms_http_error(monkeypatch, settings):
    monkeypatch.setattr(settings, "at_api_key", "test-key")
    monkeypatch.setattr(httpx, "post", _fake_post(401, {"error": "bad key"}))
    assert sms.send_sms("+254712345678", "hi") is False


def test_send_sms_without_key_is_skipped(monkeypatch, settings):
    monkeypatch.setattr(settings, "at_api_key", "")
    assert sms.send_sms("+254712345678", "hi") is False


# --- Invite and inbound webhook -------------------------------------------


def test_invite_texts_the_painter(client, outbox):
    body = client.post("/sms/invite", json={"name": "Mwangi", "phone": "0733 111 222"}).json()

    assert body["sent"] is True
    assert outbox["sms"][0]["to"] == "+254733111222"
    assert outbox["sms"][0]["message"].startswith("Hi Mwangi!")


def test_inbound_reply_is_recorded_for_invited_painter(client, db_session, outbox):
    client.post("/sms/invite", json={"name": "Mwangi", "phone": "0733 111 222"})
    result = client.post("/sms/inbound", data={"from": "+254733111222", "text": "4 5 4"}).json()

    assert result == {"status": "recorded"}
    response = db_session.scalar(select(FeedbackResponse))
    assert (response.q1, response.q2, response.q3) == (4, 5, 4)
    assert response.channel is Channel.SMS
    assert response.customer.name == "Mwangi"
    assert db_session.query(Customer).count() == 1  # matched the invited customer
    assert outbox["sms"][-1] == {"to": "+254733111222", "message": THANKS_TEXT}


def test_inbound_detractor_alerts_care_team(client, outbox):
    client.post("/sms/inbound", data={"from": "+254733111222", "text": "2 1 2 paint peeled"})

    alert = client.get("/alerts").json()[0]
    assert alert["channel"] == "sms"
    assert alert["customer_phone"] == "+254733111222"
    assert "paint peeled" in outbox["email"][0]["body"]


def test_inbound_garbage_gets_help_text_and_saves_nothing(client, db_session, outbox):
    result = client.post("/sms/inbound", data={"from": "+254733111222", "text": "hello"}).json()

    assert result == {"status": "invalid"}
    assert db_session.scalar(select(FeedbackResponse)) is None
    assert outbox["sms"] == [{"to": "+254733111222", "message": HELP_TEXT}]


def test_inbound_requires_token_when_configured(client, settings):
    settings.at_webhook_token = "s3cret"
    form = {"from": "+254733111222", "text": "4 5 4"}

    assert client.post("/sms/inbound", data=form).status_code == 403
    assert client.post("/sms/inbound?token=wrong", data=form).status_code == 403
    assert client.post("/sms/inbound?token=s3cret", data=form).status_code == 200


def test_sms_customers_are_painters(client, db_session, outbox):
    client.post("/sms/invite", json={"name": "Mwangi", "phone": "0733 111 222"})
    client.post("/sms/inbound", data={"from": "+254700999888", "text": "4 4 4"})

    segments = {c.phone: c.segment for c in db_session.scalars(select(Customer))}
    assert segments == {"+254733111222": "painter", "+254700999888": "painter"}


def test_a_homeowner_who_texts_in_becomes_a_painter(client, db_session, outbox):
    web = {"name": "Njeri", "email": "njeri@example.com", "phone": "0711 222 333"}
    client.post("/feedback", json={**web, "q1": 4, "q2": 4, "q3": 4})
    client.post("/sms/inbound", data={"from": "+254711222333", "text": "5 5 5"})

    assert db_session.scalar(select(Customer)).segment == "painter"
