"""Numbers for the admin dashboard: totals, the daily score trend and its projection."""

from datetime import date, timedelta

from sqlalchemy import Date, and_, cast, distinct, func, select
from sqlalchemy.orm import Session

from app.ai import Sentiment
from app.config import get_settings
from app.models import Alert, AlertStatus, Customer, FeedbackResponse
from app.schemas import (
    AlertCounts,
    CategorySplit,
    DayPoint,
    PeriodTotals,
    ProjectedPoint,
    QuestionAverages,
    SegmentSplit,
    SentimentSplit,
    StatsOut,
    TopicCount,
)
from app.scoring import Category

PROJECTION_DAYS = 7
TOP_TOPICS = 8


def local_day(column):
    """SQL expression: the calendar day of a timestamp in the company's timezone.

    A response at 01:00 Nairobi time is 22:00 UTC the previous day - grouping
    by UTC date would put it on the wrong day of the chart.
    """
    return cast(func.timezone(get_settings().report_timezone, column), Date)


def local_today(db: Session) -> date:
    # Ask Postgres, so Python and SQL always agree on what "today" is.
    return db.scalar(select(cast(func.timezone(get_settings().report_timezone, func.now()), Date)))


def linear_fit(points: list[tuple[float, float]]) -> tuple[float, float] | None:
    """Least-squares straight line y = intercept + slope * x. None if under 2 distinct x."""
    n = len(points)
    if n < 2:
        return None
    mean_x = sum(x for x, _ in points) / n
    mean_y = sum(y for _, y in points) / n
    spread = sum((x - mean_x) ** 2 for x, _ in points)
    if spread == 0:
        return None
    slope = sum((x - mean_x) * (y - mean_y) for x, y in points) / spread
    return mean_y - slope * mean_x, slope


def _round(value) -> float | None:
    return None if value is None else round(float(value), 2)


def _category_counts():
    """SELECT columns counting each category, in CategorySplit field order."""
    return [
        func.count().filter(FeedbackResponse.category == category).label(category.value)
        for category in Category
    ]


def _split(row) -> dict[str, int]:
    return {category.value: getattr(row, category.value) for category in Category}


def _period_totals(db: Session, period) -> tuple[PeriodTotals, QuestionAverages]:
    row = db.execute(
        select(
            func.count().label("total"),
            func.avg(FeedbackResponse.mean).label("average"),
            func.count(distinct(FeedbackResponse.customer_id)).label("respondents"),
            func.avg(FeedbackResponse.q1).label("q1"),
            func.avg(FeedbackResponse.q2).label("q2"),
            func.avg(FeedbackResponse.q3).label("q3"),
            *_category_counts(),
        ).where(period)
    ).one()
    totals = PeriodTotals(
        total_responses=row.total,
        total_respondents=row.respondents,
        average_score=_round(row.average),
        split=CategorySplit(**_split(row)),
    )
    return totals, QuestionAverages(q1=_round(row.q1), q2=_round(row.q2), q3=_round(row.q3))


def _top_topics(db: Session, period) -> list[TopicCount]:
    tagged = (
        select(
            func.unnest(FeedbackResponse.ai_topics).label("topic"),
            FeedbackResponse.ai_sentiment.label("sentiment"),
        )
        .where(period, FeedbackResponse.comment.is_not(None))
        .subquery()
    )
    count = func.count().label("count")
    rows = db.execute(
        select(
            tagged.c.topic,
            count,
            func.count().filter(tagged.c.sentiment == Sentiment.NEGATIVE.value),
        )
        .group_by(tagged.c.topic)
        .order_by(count.desc(), tagged.c.topic)
        .limit(TOP_TOPICS)
    )
    return [TopicCount(topic=t, count=c, negative=n) for t, c, n in rows]


def build_stats(db: Session, days: int) -> StatsOut:
    today = local_today(db)
    start = today - timedelta(days=days - 1)
    day = local_day(FeedbackResponse.created_at)
    in_range = day >= start
    previous_range = and_(day >= start - timedelta(days=days), day < start)

    # One grouped query for the whole trend instead of one query per day.
    rows = db.execute(
        select(
            day.label("day"),
            func.count().label("responses"),
            func.avg(FeedbackResponse.mean).label("average"),
            *_category_counts(),
        )
        .where(in_range)
        .group_by("day")
    ).all()
    by_day = {row.day: row for row in rows}

    daily = []
    for offset in range(days):
        d = start + timedelta(days=offset)
        row = by_day.get(d)
        if row is None:
            daily.append(DayPoint(date=d, responses=0, average=None))
        else:
            daily.append(
                DayPoint(
                    date=d, responses=row.responses, average=_round(row.average), **_split(row)
                )
            )

    # Fit a line through the days that have data, then extend it forward.
    fit = linear_fit([(i, p.average) for i, p in enumerate(daily) if p.average is not None])
    projection = []
    if fit:
        intercept, slope = fit
        for ahead in range(1, PROJECTION_DAYS + 1):
            x = days - 1 + ahead
            value = min(5.0, max(1.0, intercept + slope * x))  # scores live in 1..5
            projection.append(
                ProjectedPoint(date=today + timedelta(days=ahead), average=round(value, 2))
            )

    sentiment = SentimentSplit()
    for value, count in db.execute(
        select(FeedbackResponse.ai_sentiment, func.count())
        .where(in_range, FeedbackResponse.comment.is_not(None))
        .group_by(FeedbackResponse.ai_sentiment)
    ):
        setattr(sentiment, value.value if value else "untagged", count)

    segments = SegmentSplit()
    for segment, count in db.execute(
        select(Customer.segment, func.count(distinct(FeedbackResponse.customer_id)))
        .join(FeedbackResponse.customer)
        .where(in_range)
        .group_by(Customer.segment)
    ):
        setattr(segments, segment.value, count)

    current, questions = _period_totals(db, in_range)
    previous, _ = _period_totals(db, previous_range)
    all_time = db.scalar(select(func.count(distinct(FeedbackResponse.customer_id))))

    open_alerts, unread_alerts = db.execute(
        select(
            func.count().filter(Alert.status == AlertStatus.OPEN),
            func.count().filter(Alert.status == AlertStatus.OPEN, Alert.is_read.is_(False)),
        )
    ).one()

    return StatsOut(
        days=days,
        total_respondents=current.total_respondents,
        all_time_respondents=all_time,
        total_responses=current.total_responses,
        average_score=current.average_score,
        split=current.split,
        daily=daily,
        projection=projection,
        trend_per_day=round(fit[1], 3) if fit else None,
        alerts=AlertCounts(open=open_alerts, unread=unread_alerts),
        sentiment=sentiment,
        segments=segments,
        topics=_top_topics(db, in_range),
        tagged_comments=sum(sentiment.model_dump(exclude={"untagged"}).values()),
        questions=questions,
        previous=previous,
    )
