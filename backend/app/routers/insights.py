"""Read-only analytics for the admin dashboard."""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import contains_eager, joinedload

from app.auth import require_staff
from app.database import DbSession
from app.models import Channel, Customer, FeedbackResponse
from app.phone import normalize_phone
from app.schemas import ResponseOut, ResponsePage, StatsOut
from app.scoring import Category
from app.services.insights import build_stats, local_day, local_today

router = APIRouter(tags=["insights"], dependencies=[Depends(require_staff)])

Days = Annotated[int, Query(ge=1, le=365)]


@router.get("/stats")
def get_stats(db: DbSession, days: Days = 30) -> StatsOut:
    return build_stats(db, days)


def _like(term: str) -> str:
    """Escape LIKE wildcards so a search for '50%' means the text '50%', not '50...'."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("/responses")
def list_responses(
    db: DbSession,
    q: Annotated[str, Query(max_length=100)] = "",
    category: Category | None = None,
    channel: Channel | None = None,
    days: Days | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ResponsePage:
    """Searchable log of individual ratings, newest first."""
    filters = []
    if q.strip():
        pattern = _like(q.strip())
        matches = [
            Customer.name.ilike(pattern, escape="\\"),
            Customer.email.ilike(pattern, escape="\\"),
            Customer.phone.ilike(pattern, escape="\\"),
            FeedbackResponse.comment.ilike(pattern, escape="\\"),
        ]
        try:  # "0722 000 111" should find the stored "+254722000111"
            matches.append(Customer.phone == normalize_phone(q))
        except ValueError:
            pass
        filters.append(or_(*matches))
    if category is not None:
        filters.append(FeedbackResponse.category == category)
    if channel is not None:
        filters.append(FeedbackResponse.channel == channel)
    if days is not None:
        start = local_today(db) - timedelta(days=days - 1)
        filters.append(local_day(FeedbackResponse.created_at) >= start)

    base = select(FeedbackResponse).join(FeedbackResponse.customer).where(*filters)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(
        # contains_eager: reuse the customer JOIN we already have instead of joining twice.
        base.options(contains_eager(FeedbackResponse.customer), joinedload(FeedbackResponse.alert))
        .order_by(FeedbackResponse.created_at.desc(), FeedbackResponse.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return ResponsePage(items=[ResponseOut.from_response(r) for r in rows], total=total)
