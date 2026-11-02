"""Numbers for the admin dashboard: totals, the daily score trend and its projection."""

from datetime import date, timedelta

from sqlalchemy import Date, cast, distinct, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Alert, AlertStatus, FeedbackResponse
from app.schemas import (
    AlertCounts,
    CategorySplit,
    DayPoint,
    ProjectedPoint,
    SentimentSplit,
    StatsOut,
)

PROJECTION_DAYS = 7


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


def build_stats(db: Session, days: int) -> StatsOut:
    today = local_today(db)
    start = today - timedelta(days=days - 1)
    day = local_day(FeedbackResponse.created_at)
    in_range = day >= start

    # One grouped query for the whole trend instead of one query per day.
    rows = db.execute(
        select(day.label("day"), func.count(), func.avg(FeedbackResponse.mean))
        .where(in_range)
        .group_by("day")
    ).all()
    by_day = {row[0]: (row[1], float(row[2])) for row in rows}

    daily = []
    for offset in range(days):
        d = start + timedelta(days=offset)
        count, average = by_day.get(d, (0, None))
        rounded = None if average is None else round(average, 2)
        daily.append(DayPoint(date=d, responses=count, average=rounded))

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

    split = CategorySplit()
    for category, count in db.execute(
        select(FeedbackResponse.category, func.count())
        .where(in_range)
        .group_by(FeedbackResponse.category)
    ):
        setattr(split, category.value, count)

    sentiment = SentimentSplit()
    for value, count in db.execute(
        select(FeedbackResponse.ai_sentiment, func.count())
        .where(in_range, FeedbackResponse.comment.is_not(None))
        .group_by(FeedbackResponse.ai_sentiment)
    ):
        setattr(sentiment, value.value if value else "untagged", count)

    total_responses, average_score, respondents = db.execute(
        select(
            func.count(),
            func.avg(FeedbackResponse.mean),
            func.count(distinct(FeedbackResponse.customer_id)),
        ).where(in_range)
    ).one()
    all_time = db.scalar(select(func.count(distinct(FeedbackResponse.customer_id))))

    open_alerts, unread_alerts = db.execute(
        select(
            func.count().filter(Alert.status == AlertStatus.OPEN),
            func.count().filter(Alert.status == AlertStatus.OPEN, Alert.is_read.is_(False)),
        )
    ).one()

    return StatsOut(
        days=days,
        total_respondents=respondents,
        all_time_respondents=all_time,
        total_responses=total_responses,
        average_score=None if average_score is None else round(float(average_score), 2),
        split=split,
        daily=daily,
        projection=projection,
        trend_per_day=round(fit[1], 3) if fit else None,
        alerts=AlertCounts(open=open_alerts, unread=unread_alerts),
        sentiment=sentiment,
    )
