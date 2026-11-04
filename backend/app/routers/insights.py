"""Read-only analytics for the admin dashboard."""

import csv
import io
import re
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import contains_eager, joinedload

from app.ai import Sentiment
from app.auth import require_staff
from app.database import DbSession
from app.models import Channel, Customer, FeedbackResponse, Segment
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


def response_filters(
    db: DbSession,
    q: Annotated[str, Query(max_length=100)] = "",
    category: Category | None = None,
    channel: Channel | None = None,
    sentiment: Sentiment | None = None,
    segment: Segment | None = None,
    days: Days | None = None,
) -> list[ColumnElement[bool]]:
    """WHERE clauses shared by the response log and its CSV export."""
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
    if sentiment is not None:
        filters.append(FeedbackResponse.ai_sentiment == sentiment)
    if segment is not None:
        filters.append(Customer.segment == segment)
    if days is not None:
        start = local_today(db) - timedelta(days=days - 1)
        filters.append(local_day(FeedbackResponse.created_at) >= start)
    return filters


Filters = Annotated[list[ColumnElement[bool]], Depends(response_filters)]


def _matching(filters: list[ColumnElement[bool]]) -> Select[tuple[FeedbackResponse]]:
    return select(FeedbackResponse).join(FeedbackResponse.customer).where(*filters)


def _newest_first(query: Select[tuple[FeedbackResponse]]) -> Select[tuple[FeedbackResponse]]:
    # contains_eager: reuse the customer JOIN we already have instead of joining twice.
    return query.options(
        contains_eager(FeedbackResponse.customer), joinedload(FeedbackResponse.alert)
    ).order_by(FeedbackResponse.created_at.desc(), FeedbackResponse.id.desc())


@router.get("/responses")
def list_responses(
    db: DbSession,
    filters: Filters,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ResponsePage:
    """Searchable log of individual ratings, newest first."""
    base = _matching(filters)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(_newest_first(base).limit(limit).offset(offset))
    return ResponsePage(items=[ResponseOut.from_response(r) for r in rows], total=total)


CSV_COLUMNS = [
    "submitted_at",
    "name",
    "email",
    "phone",
    "segment",
    "channel",
    "q1",
    "q2",
    "q3",
    "mean",
    "category",
    "sentiment",
    "topics",
    "comment",
]
# Spreadsheets run a cell that starts with one of these as a formula (CSV injection).
FORMULA_START = ("=", "+", "-", "@", "\t", "\r")
# A bare E.164 number like +254712345678 can't run as a formula, so it stays readable.
PHONE = re.compile(r"\+\d{7,15}")


def _cell(value: object) -> str:
    text = "" if value is None else str(value)
    if PHONE.fullmatch(text):
        return text
    return f"'{text}" if text.startswith(FORMULA_START) else text


@router.get("/responses/export")
def export_responses(db: DbSession, filters: Filters) -> Response:
    """The filtered response log as a CSV download, newest first."""
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(CSV_COLUMNS)
    for r in db.scalars(_newest_first(_matching(filters))):
        c = r.customer
        row = [
            r.created_at.isoformat(),
            c.name,
            c.email,
            c.phone,
            c.segment,
            r.channel,
            r.q1,
            r.q2,
            r.q3,
            r.mean,
            r.category,
            r.ai_sentiment,
            "; ".join(r.ai_topics or []),
            r.comment,
        ]
        writer.writerow([_cell(v) for v in row])
    filename = f"feedback-{local_today(db).isoformat()}.csv"
    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
