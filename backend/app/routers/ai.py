"""AI assistance for the care team. Care team only, and only when someone clicks a button."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from app import ai
from app.auth import require_staff
from app.database import DbSession
from app.models import FeedbackResponse
from app.schemas import AiStatusOut, SummaryOut
from app.services.insights import build_stats, local_day, local_today

router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[Depends(require_staff)])

# Enough to see the patterns, while keeping each summary quick and cheap. The UI
# says "based on the latest N of M comments" whenever the cap kicks in.
MAX_COMMENTS = 150


@router.get("/status")
def status() -> AiStatusOut:
    """Lets the dashboard hide AI buttons when no key is configured."""
    return AiStatusOut(enabled=ai.is_enabled(), demo=ai.is_demo())


@router.post("/summary")
def summary(db: DbSession, days: Annotated[int, Query(ge=1, le=365)] = 30) -> SummaryOut:
    """One-click plain-English briefing on what customers are saying."""
    start = local_today(db) - timedelta(days=days - 1)
    in_range = [local_day(FeedbackResponse.created_at) >= start]
    has_comment = FeedbackResponse.comment.is_not(None)

    total = db.scalar(select(func.count()).where(*in_range, has_comment))
    if not total:
        raise HTTPException(status_code=422, detail="No comments in this period to summarise yet")
    rows = db.execute(
        select(FeedbackResponse.mean, FeedbackResponse.comment)
        .where(*in_range, has_comment)
        .order_by(FeedbackResponse.created_at.desc())
        .limit(MAX_COMMENTS)
    ).all()

    try:
        result = ai.summarize(_stats_text(db, days, in_range), [(float(m), c) for m, c in rows])
    except ai.AIUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"AI summary unavailable: {exc}") from exc

    return SummaryOut(
        **result.model_dump(),
        days=days,
        comments_used=len(rows),
        comments_total=total,
        generated_at=datetime.now(UTC),
    )


def _stats_text(db: DbSession, days: int, in_range: list) -> str:
    """The numbers behind the comments, so the AI can weigh them (no personal data)."""
    stats = build_stats(db, days)
    q1, q2, q3 = db.execute(
        select(
            func.avg(FeedbackResponse.q1),
            func.avg(FeedbackResponse.q2),
            func.avg(FeedbackResponse.q3),
        ).where(*in_range)
    ).one()
    per_question = (
        f"product experience {float(q1):.2f}, customer care {float(q2):.2f}, "
        f"happy with product {float(q3):.2f}"
        if q1 is not None
        else "n/a"
    )
    trend = (
        f"{stats.trend_per_day * 7:+.2f} points per week"
        if stats.trend_per_day is not None
        else "not enough data"
    )
    return (
        f"Last {days} days: {stats.total_responses} responses from "
        f"{stats.total_respondents} customers. Average score {stats.average_score}. "
        f"Detractors {stats.split.detractor}, passives {stats.split.passive}, "
        f"promoters {stats.split.promoter}. Average per question: {per_question}. "
        f"Trend: {trend}."
    )
