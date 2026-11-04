import csv
import io
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models import Alert, Channel, Customer, FeedbackResponse, Segment
from app.scoring import score_answers
from app.services.insights import linear_fit


@pytest.fixture
def add_response(db_session):
    """Insert a response N days ago (Nairobi is a fixed UTC+3, so N days ago is exact)."""

    def add(
        name,
        q1,
        q2,
        q3,
        *,
        days_ago=0,
        email=None,
        phone="+254700000000",
        channel=Channel.WEB,
        segment=Segment.HOMEOWNER,
        comment=None,
        sentiment=None,
        topics=None,
    ):
        customer = db_session.query(Customer).filter_by(name=name).one_or_none()
        if customer is None:
            customer = Customer(name=name, email=email, phone=phone, segment=segment)
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
            ai_sentiment=sentiment,
            ai_topics=topics,
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


def test_daily_trend_splits_each_day_by_category(client, add_response):
    add_response("A", 1, 1, 1, days_ago=1)
    add_response("B", 3, 3, 3, days_ago=1)
    add_response("C", 5, 5, 5, days_ago=1)
    add_response("D", 5, 5, 5, days_ago=0)

    daily = client.get("/stats", params={"days": 2}).json()["daily"]

    split = [(d["detractor"], d["passive"], d["promoter"]) for d in daily]
    assert split == [(1, 1, 1), (0, 0, 1)]


def test_segments_count_distinct_respondents_in_range(client, add_response):
    add_response("Homeowner", 5, 5, 5)
    add_response("Homeowner", 4, 4, 4)  # one person, two answers
    add_response("Painter A", 3, 3, 3, segment=Segment.PAINTER)
    add_response("Painter B", 3, 3, 3, segment=Segment.PAINTER, channel=Channel.SMS)
    add_response("Old Painter", 3, 3, 3, segment=Segment.PAINTER, days_ago=40)

    assert client.get("/stats").json()["segments"] == {"homeowner": 1, "painter": 2}


def test_topics_rank_by_mentions_and_count_negative_comments(client, add_response):
    add_response("A", 2, 2, 2, comment="x", sentiment="negative", topics=["colour", "price"])
    add_response("B", 2, 2, 2, comment="x", sentiment="negative", topics=["colour"])
    add_response("C", 5, 5, 5, comment="x", sentiment="positive", topics=["colour", "finish"])
    add_response("D", 4, 4, 4, comment="x", sentiment="mixed", topics=["price"])
    add_response("E", 4, 4, 4, comment="not tagged yet")
    add_response("F", 1, 1, 1, comment="x", sentiment="negative", topics=["smell"], days_ago=40)

    stats = client.get("/stats").json()

    assert stats["topics"] == [
        {"topic": "colour", "count": 3, "negative": 2},
        {"topic": "price", "count": 2, "negative": 1},
        {"topic": "finish", "count": 1, "negative": 0},
    ]
    assert stats["tagged_comments"] == 4  # E has no sentiment, F is out of range


def test_topics_are_capped_at_eight(client, add_response):
    topics = [f"topic{i}" for i in range(10)]
    add_response("A", 4, 4, 4, comment="x", sentiment="neutral", topics=topics)
    add_response("B", 4, 4, 4, comment="x", sentiment="neutral", topics=["topic9"])

    ranked = [t["topic"] for t in client.get("/stats").json()["topics"]]
    assert len(ranked) == 8
    assert ranked[0] == "topic9"


def test_question_averages(client, add_response):
    add_response("A", 5, 2, 4)
    add_response("B", 4, 3, 4)
    add_response("C", 4, 4, 1)
    add_response("Old", 1, 1, 1, days_ago=40)

    assert client.get("/stats").json()["questions"] == {"q1": 4.33, "q2": 3.0, "q3": 3.0}


def test_question_averages_are_null_without_data(client):
    assert client.get("/stats").json()["questions"] == {"q1": None, "q2": None, "q3": None}


def test_previous_period_is_the_window_just_before(client, add_response):
    add_response("Now", 5, 5, 5, days_ago=0)
    add_response("Now", 5, 5, 5, days_ago=6)  # last day of this 7-day window
    add_response("Before A", 2, 2, 2, days_ago=7)  # first day before it
    add_response("Before B", 3, 3, 3, days_ago=10)
    add_response("Before B", 4, 4, 4, days_ago=13)  # oldest day of the previous window
    add_response("Too old", 1, 1, 1, days_ago=14)

    stats = client.get("/stats", params={"days": 7}).json()

    assert stats["total_responses"] == 2
    assert stats["previous"] == {
        "total_responses": 3,
        "total_respondents": 2,
        "average_score": 3.0,
        "split": {"detractor": 1, "passive": 1, "promoter": 1},
    }


def test_previous_period_when_empty(client, add_response):
    add_response("Now", 5, 5, 5)

    assert client.get("/stats", params={"days": 7}).json()["previous"] == {
        "total_responses": 0,
        "total_respondents": 0,
        "average_score": None,
        "split": {"detractor": 0, "passive": 0, "promoter": 0},
    }


def test_responses_filter_by_sentiment_and_segment(client, add_response):
    add_response("Angry homeowner", 1, 1, 1, comment="x", sentiment="negative")
    add_response("Angry painter", 2, 2, 2, comment="x", sentiment="negative", segment="painter")
    add_response("Happy painter", 5, 5, 5, comment="x", sentiment="positive", segment="painter")

    def names(**params):
        items = client.get("/responses", params=params).json()["items"]
        return sorted(item["customer_name"] for item in items)

    assert names(sentiment="negative") == ["Angry homeowner", "Angry painter"]
    assert names(segment="painter") == ["Angry painter", "Happy painter"]
    assert names(sentiment="negative", segment="painter") == ["Angry painter"]
    assert client.get("/responses", params={"segment": "landlord"}).status_code == 422

    items = client.get("/responses").json()["items"]
    assert {i["customer_name"]: i["segment"] for i in items} == {
        "Angry homeowner": "homeowner",
        "Angry painter": "painter",
        "Happy painter": "painter",
    }


def _csv_rows(response):
    return list(csv.DictReader(io.StringIO(response.text)))


def test_export_downloads_the_filtered_log_as_csv(client, add_response):
    add_response(
        "Chebet",
        1,
        2,
        2,
        email="chebet@example.com",
        segment=Segment.PAINTER,
        channel=Channel.SMS,
        comment="Paint peeled, again",
        sentiment="negative",
        topics=["durability", "finish"],
    )
    add_response("Akinyi", 5, 5, 5, days_ago=1)

    response = client.get("/responses/export", params={"segment": "painter"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    disposition = response.headers["content-disposition"]
    assert disposition.startswith('attachment; filename="feedback-')
    assert date.fromisoformat(disposition.removeprefix('attachment; filename="feedback-')[:10])
    assert disposition.endswith('.csv"')

    assert response.text.splitlines()[0] == (
        "submitted_at,name,email,phone,segment,channel,q1,q2,q3,mean,category,sentiment,topics,comment"
    )
    rows = _csv_rows(response)
    assert len(rows) == 1  # Akinyi is a homeowner: filtered out
    row = rows[0]
    assert datetime.fromisoformat(row.pop("submitted_at")).tzinfo is not None
    assert row == {
        "name": "Chebet",
        "email": "chebet@example.com",
        "phone": "+254700000000",  # a bare phone number is not a formula
        "segment": "painter",
        "channel": "sms",
        "q1": "1",
        "q2": "2",
        "q3": "2",
        "mean": "1.67",
        "category": "detractor",
        "sentiment": "negative",
        "topics": "durability; finish",
        "comment": "Paint peeled, again",
    }


def test_export_without_filters_is_newest_first(client, add_response):
    add_response("Older", 4, 4, 4, days_ago=2)
    add_response("Newer", 4, 4, 4)

    rows = _csv_rows(client.get("/responses/export"))
    assert [r["name"] for r in rows] == ["Newer", "Older"]
    assert rows[0]["sentiment"] == "" and rows[0]["topics"] == "" and rows[0]["comment"] == ""


@pytest.mark.parametrize(
    ("comment", "cell"),
    [
        ('=HYPERLINK("http://evil")', '\'=HYPERLINK("http://evil")'),
        ("+1 great", "'+1 great"),
        ("+254700000000+1", "'+254700000000+1"),  # phone-like but a formula
        ("-2 bad", "'-2 bad"),
        ("@SUM(A1)", "'@SUM(A1)"),
        ("Fine = good", "Fine = good"),  # only a leading formula character is dangerous
    ],
)
def test_export_neutralises_spreadsheet_formulas(client, add_response, comment, cell):
    add_response("=cmd|' /C calc'!A0", 4, 4, 4, comment=comment)

    row = _csv_rows(client.get("/responses/export"))[0]
    assert row["comment"] == cell
    assert row["name"] == "'=cmd|' /C calc'!A0"


def test_export_is_for_staff_only(anon_client):
    assert anon_client.get("/responses/export").status_code == 401
