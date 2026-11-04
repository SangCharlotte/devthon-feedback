"""USSD questionnaire: menu logic on its own, then whole sessions through the callback."""

import pytest
from sqlalchemy import select

from app import ussd
from app.models import Channel, Customer, FeedbackResponse, Segment
from app.routers.sms import USSD_INVITE_TEXT

PHONE = "+254711000222"

# --- Menu logic --------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "screen"),
    [
        ("", "(1/3)\nRate your experience with our product:"),
        ("4", "(2/3)\nRate our customer care:"),
        ("4*5", "(3/3)\nAre you happy with the product?"),
        ("4*5*4", "Type a comment, or 0 to skip"),
    ],
)
def test_each_answer_moves_to_the_next_screen(text, screen):
    step = ussd.next_step(text)
    assert isinstance(step, ussd.Prompt) and screen in step.text


def test_a_wrong_key_re_asks_the_same_question():
    step = ussd.next_step("4*9")
    assert isinstance(step, ussd.Prompt)
    assert "Please choose 1 to 5" in step.text and "(2/3)" in step.text
    # ...and the next valid key carries on as if the mistake never happened.
    assert "(3/3)" in ussd.next_step("4*9*5").text
    assert "Please choose" not in ussd.next_step("4*9*5").text


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("4*5*4*0", ussd.Complete(4, 5, 4, None)),
        ("2*1*2*Peeled after a week", ussd.Complete(2, 1, 2, "Peeled after a week")),
        ("2*1*2*5* stars*", ussd.Complete(2, 1, 2, "5* stars*")),  # '*' inside a comment
    ],
)
def test_session_completes_after_the_comment_screen(text, expected):
    assert ussd.next_step(text) == expected


def test_every_screen_fits_a_ussd_display():
    screens = ["", "4", "4*9", "4*5", "4*5*4"]
    assert all(len(f"CON {ussd.next_step(t).text}") <= 182 for t in screens)


# --- Through the callback ------------------------------------------------------


def _dial(client, text, phone=PHONE, token=""):
    form = {"sessionId": "ATUid_1", "serviceCode": "*384*1234#", "phoneNumber": phone, "text": text}
    return client.post(f"/ussd?token={token}", data=form)


def test_open_screens_keep_the_session_alive_and_save_nothing(client, db_session):
    response = _dial(client, "4*5")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert response.text.startswith("CON ")
    assert db_session.scalar(select(FeedbackResponse)) is None


def test_finished_session_records_a_painter_response(client, db_session, outbox):
    response = _dial(client, "5*4*5*Great coverage")

    assert response.text.startswith("END Thank you! You rated us 4.67/5")
    saved = db_session.scalar(select(FeedbackResponse))
    assert (saved.q1, saved.q2, saved.q3) == (5, 4, 5)
    assert saved.channel == Channel.USSD and saved.comment == "Great coverage"
    customer = db_session.scalar(select(Customer))
    assert customer.phone == PHONE and customer.segment == Segment.PAINTER
    assert outbox["email"] == []  # promoters raise no alert


def test_ussd_detractor_alerts_the_care_team(client, outbox):
    response = _dial(client, "2*1*2*0")
    assert "care team will call you" in response.text
    assert client.get("/alerts").json()[0]["channel"] == "ussd"
    assert len(outbox["email"]) == 1


def test_ussd_answers_show_up_under_their_own_channel(client):
    _dial(client, "4*4*4*0")
    items = client.get("/responses", params={"channel": "ussd"}).json()["items"]
    assert [i["channel"] for i in items] == ["ussd"]


def test_ussd_requires_the_webhook_token_when_configured(client, settings):
    settings.at_webhook_token = "s3cret"
    assert _dial(client, "", token="wrong").status_code == 403
    assert _dial(client, "", token="s3cret").status_code == 200


def test_unreadable_phone_number_ends_the_session(client, db_session):
    assert _dial(client, "4*4*4*0", phone="not-a-phone").text.startswith("END ")
    assert db_session.scalar(select(FeedbackResponse)) is None


def test_invite_mentions_the_ussd_code_when_configured(client, settings, outbox):
    settings.at_ussd_code = "*384*1234#"
    client.post("/sms/invite", json={"name": "Otieno", "phone": "0711000333"})
    message = outbox["sms"][0]["message"]
    assert "dial *384*1234#" in message and "4 5 4" in message


def test_ussd_invite_fits_in_one_sms():
    assert len(USSD_INVITE_TEXT.format(name="Mwangi Kariuki", code="*384*12345#")) <= 160
