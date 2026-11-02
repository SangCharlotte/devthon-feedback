from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models import Alert, Channel, Customer, FeedbackResponse
from app.scoring import score_answers
from app.services.insights import linear_fit


@pytest.fixture
def add_response(db_session):
    """Insert a response N days ago (Nairobi is a fixed UTC+3, so N days ago is exact)."""

    def add(name, q1, q2, q3, *, days_ago=0, email=None, channel=Channel.WEB, comment=None):
        customer = db_session.query(Customer).filter_by(name=name).one_or_none()
        if customer is None:
            customer = Customer(name=name, email=email, phone="+254700000000")
            db_session.add(customer)
        result = score_answers(q1, q2, q3)
        response = FeedbackResponse(
            customer=customer,
            q1=q1,
            q2=q2,
            q3=q3,
            mean=Decimal(str(result.mean)),
            category=result.category,
            channel=channel,
            comment=comment,
            created_at=datetime.now(UTC) - timedelta(days=days_ago),
        )
        db_session.add(response)
        if result.needs_alert:
            db_session.add(Alert(response=response))
        db_session.commit()
        return response

    return add


def test_linear_fit_finds_the_line():
    assert linear_fit([(0, 1.0), (1, 2.0), (2, 3.0)]) == pytest.approx((1.0, 1.0))
    assert linear_fit([(0, 4.0)]) is None  # one point has no direction
    assert linear_fit([]) is None


def test_stats_on_empty_database(client):
    stats = client.get("/stats", params={"days": 7}).json()

    assert stats["total_respondents"] == 0
    assert stats["average_score"] is None
    assert len(stats["daily"]) == 7
    assert all(day["average"] is None for day in stats["daily"])
    assert stats["projection"] == []


def test_stats_totals_split_and_alerts(client, add_response):
    add_response("Akinyi", 5, 5, 5)
    add_response("Akinyi", 4, 4, 4)  # same person twice: one respondent, two responses
    add_response("Baraka", 3, 3, 3)
    add_response("Chebet", 1, 2, 2)
    add_response("Old Customer", 5, 5, 5, days_ago=40)  # outside the 30-day window

    stats = client.get("/stats").json()

    assert stats["total_respondents"] == 3
    assert stats["all_time_respondents"] == 4
    assert stats["total_responses"] == 4
    assert stats["split"] == {"detractor": 1, "passive": 1, "promoter": 2}
    assert stats["alerts"] == {"open": 1, "unread": 1}


def test_daily_trend_averages_each_day_and_leaves_gaps(client, add_response):
    add_response("A", 2, 2, 2, days_ago=2)
    add_response("B", 4, 4, 4, days_ago=2)
    add_response("C", 5, 5, 5, days_ago=0)

    daily = client.get("/stats", params={"days": 3}).json()["daily"]

    assert [d["responses"] for d in daily] == [2, 0, 1]
    assert [d["average"] for d in daily] == [3.0, None, 5.0]  # None = no data, not zero
    assert date.fromisoformat(daily[-1]["date"]) - date.fromisoformat(daily[0]["date"]) == (
        timedelta(days=2)
    )


def test_projection_extends_the_trend_and_stays_in_range(client, add_response):
    # Scores rising by one point a day: 1, 2, 3 -> the line keeps going, capped at 5.
    add_response("A", 1, 1, 1, days_ago=2)
    add_response("B", 2, 2, 2, days_ago=1)
    add_response("C", 3, 3, 3, days_ago=0)

    stats = client.get("/stats", params={"days": 3}).json()

    assert stats["trend_per_day"] == pytest.approx(1.0)
    projected = [p["average"] for p in stats["projection"]]
    assert projected == [4.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0]
    first = date.fromisoformat(stats["projection"][0]["date"])
    assert first == date.fromisoformat(stats["daily"][-1]["date"]) + timedelta(days=1)


def test_responses_newest_first_with_question_breakdown(client, add_response):
    add_response("Older", 3, 3, 3, days_ago=1)
    add_response("Chebet", 1, 2, 2, comment="Colour faded")

    page = client.get("/responses").json()

    assert page["total"] == 2
    first = page["items"][0]
    assert first["customer_name"] == "Chebet"
    assert (first["q1"], first["q2"], first["q3"]) == (1, 2, 2)
    assert first["mean"] == 1.67
    assert first["category"] == "detractor"
    assert first["alert_status"] == "open"
    assert page["items"][1]["alert_status"] is None


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("akinyi", ["Akinyi Wanjiru"]),  # name, case-insensitive
        ("baraka@", ["Baraka"]),  # email
        ("peeled", ["Baraka"]),  # comment text
        ("0700 000 000", ["Baraka", "Akinyi Wanjiru"]),  # local phone format -> +254...
        ("100%", []),  # % is a literal, not a wildcard
    ],
)
def test_search(client, add_response, query, expected):
    add_response("Akinyi Wanjiru", 5, 5, 5, days_ago=1, email="akinyi@example.com")
    add_response("Baraka", 2, 2, 2, email="baraka@example.com", comment="Paint peeled")

    items = client.get("/responses", params={"q": query}).json()["items"]
    assert [item["customer_name"] for item in items] == expected


def test_filters_and_pagination(client, add_response):
    for i in range(5):
        add_response(f"Promoter {i}", 5, 5, 5, days_ago=i)
    add_response("Texter", 2, 2, 2, channel=Channel.SMS)

    assert client.get("/responses", params={"category": "promoter"}).json()["total"] == 5
    assert [
        r["customer_name"]
        for r in client.get("/responses", params={"channel": "sms"}).json()["items"]
    ] == ["Texter"]

    page = client.get("/responses", params={"category": "promoter", "limit": 2, "offset": 2})
    assert [r["customer_name"] for r in page.json()["items"]] == ["Promoter 2", "Promoter 3"]

    recent = client.get("/responses", params={"days": 2}).json()
    assert recent["total"] == 3  # today and yesterday: Promoter 0, Promoter 1, Texter
