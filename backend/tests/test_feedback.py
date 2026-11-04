from sqlalchemy import func, select

from app.models import Alert, Customer, FeedbackResponse


def _payload(**overrides):
    data = {
        "name": "Wanjiku Kamau",
        "email": "wanjiku@example.com",
        "phone": "0712 345 678",
        "q1": 5,
        "q2": 4,
        "q3": 5,
    }
    data.update(overrides)
    return data


def _count(db, model):
    return db.scalar(select(func.count()).select_from(model))


def test_promoter_is_saved_without_alert(client, db_session):
    response = client.post("/feedback", json=_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["mean"] == 4.67
    assert body["category"] == "promoter"
    assert body["alert_created"] is False
    assert _count(db_session, FeedbackResponse) == 1
    assert _count(db_session, Alert) == 0


def test_passive_does_not_alert(client):
    body = client.post("/feedback", json=_payload(q1=3, q2=3, q3=3)).json()
    assert body["category"] == "passive"
    assert body["alert_created"] is False


def test_detractor_creates_alert_visible_to_care_team(client):
    # The brief's own example: (2 + 3 + 2) / 3 = 2.33
    body = client.post("/feedback", json=_payload(q1=2, q2=3, q3=2)).json()
    assert body["mean"] == 2.33
    assert body["category"] == "detractor"
    assert body["alert_created"] is True

    alerts = client.get("/alerts", params={"status": "open"}).json()
    assert len(alerts) == 1
    assert alerts[0]["customer_name"] == "Wanjiku Kamau"
    assert alerts[0]["customer_email"] == "wanjiku@example.com"
    assert alerts[0]["mean"] == 2.33
    assert alerts[0]["is_read"] is False


def test_returning_customer_is_matched_by_email(client, db_session):
    client.post("/feedback", json=_payload())
    client.post("/feedback", json=_payload(name="Wanjiku K.", email="WANJIKU@example.com"))

    assert _count(db_session, Customer) == 1
    assert _count(db_session, FeedbackResponse) == 2
    assert db_session.scalar(select(Customer.name)) == "Wanjiku K."


def test_phone_is_stored_in_international_format(client, db_session):
    client.post("/feedback", json=_payload(phone="0712-345-678"))
    assert db_session.scalar(select(Customer.phone)) == "+254712345678"


def test_invalid_input_is_rejected_and_nothing_saved(client, db_session):
    assert client.post("/feedback", json=_payload(q2=6)).status_code == 422
    assert client.post("/feedback", json=_payload(email="not-an-email")).status_code == 422
    assert client.post("/feedback", json=_payload(phone="12")).status_code == 422
    assert client.post("/feedback", json=_payload(name="   ")).status_code == 422
    assert _count(db_session, Customer) == 0
    assert _count(db_session, FeedbackResponse) == 0


def test_segment_defaults_to_homeowner_and_the_latest_answer_wins(client, db_session):
    client.post("/feedback", json=_payload())
    customer = db_session.scalar(select(Customer))
    assert customer.segment == "homeowner"

    client.post("/feedback", json=_payload(segment="painter"))
    db_session.refresh(customer)
    assert customer.segment == "painter"

    assert client.post("/feedback", json=_payload(segment="landlord")).status_code == 422
