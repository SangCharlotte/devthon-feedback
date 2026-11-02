"""Request/response shapes for the API (what JSON goes in and comes out)."""

from datetime import date, datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
)

from app.ai import FeedbackSummary, Sentiment
from app.auth import MIN_PASSWORD_LENGTH, CurrentUser, normalize_username
from app.models import Alert, AlertStatus, Channel, FeedbackResponse, Role
from app.phone import normalize_phone
from app.scoring import Category

Rating = Annotated[int, Field(ge=1, le=5)]
Phone = Annotated[str, AfterValidator(normalize_phone)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class FeedbackIn(BaseModel):
    name: Name
    email: EmailStr
    phone: Phone
    q1: Rating
    q2: Rating
    q3: Rating
    comment: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class FeedbackOut(BaseModel):
    id: int
    mean: float
    category: Category
    alert_created: bool


class AlertOut(BaseModel):
    id: int
    status: AlertStatus
    is_read: bool
    created_at: datetime
    resolved_at: datetime | None
    email_sent_at: datetime | None
    sms_sent_at: datetime | None
    replied_at: datetime | None
    replied_by: str | None
    response_id: int
    channel: Channel
    mean: float
    customer_name: str
    customer_email: str | None
    customer_phone: str | None

    @classmethod
    def from_alert(cls, alert: Alert) -> "AlertOut":
        response = alert.response
        customer = response.customer
        return cls(
            id=alert.id,
            status=alert.status,
            is_read=alert.is_read,
            created_at=alert.created_at,
            resolved_at=alert.resolved_at,
            email_sent_at=alert.email_sent_at,
            sms_sent_at=alert.sms_sent_at,
            replied_at=alert.replied_at,
            replied_by=alert.replied_by,
            response_id=response.id,
            channel=response.channel,
            mean=float(response.mean),
            customer_name=customer.name,
            customer_email=customer.email,
            customer_phone=customer.phone,
        )


class AlertUpdate(BaseModel):
    """PATCH body: send only the fields you want to change."""

    is_read: bool | None = None
    status: AlertStatus | None = None


class SmsInviteIn(BaseModel):
    name: Name
    phone: Phone


class SmsInviteOut(BaseModel):
    customer_id: int
    sent: bool


class LoginIn(BaseModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
    password: Annotated[str, StringConstraints(max_length=200)]


class MeOut(BaseModel):
    username: str
    display_name: str
    role: Role
    is_owner: bool

    @classmethod
    def from_user(cls, user: CurrentUser) -> "MeOut":
        return cls(
            username=user.username,
            display_name=user.display_name,
            role=user.role,
            is_owner=user.staff_id is None,
        )


Password = Annotated[str, StringConstraints(min_length=MIN_PASSWORD_LENGTH, max_length=200)]


class PasswordChangeIn(BaseModel):
    current_password: Annotated[str, StringConstraints(max_length=200)]
    new_password: Password


# ---------- Team (staff accounts) ----------


class StaffIn(BaseModel):
    # Letters, digits, dot, dash, underscore: safe to show anywhere, easy to type.
    # Lowercased first (BeforeValidator), then checked against the pattern.
    username: Annotated[
        str,
        BeforeValidator(lambda v: normalize_username(v) if isinstance(v, str) else v),
        StringConstraints(min_length=2, max_length=50, pattern=r"^[a-z0-9._-]+$"),
    ]
    display_name: Name
    password: Password
    role: Role = Role.REP


class StaffUpdate(BaseModel):
    """Only the fields that are sent get changed."""

    display_name: Name | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: Password | None = None


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    role: Role
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


# ---------- Dashboard insights ----------


class CategorySplit(BaseModel):
    detractor: int = 0
    passive: int = 0
    promoter: int = 0


class DayPoint(BaseModel):
    date: date
    responses: int
    average: float | None  # None on days nobody answered (a gap, not a zero)


class ProjectedPoint(BaseModel):
    date: date
    average: float


class SentimentSplit(BaseModel):
    """AI tags on the comments in the period. Untagged = AI off, failed, or not run yet."""

    positive: int = 0
    neutral: int = 0
    mixed: int = 0
    negative: int = 0
    untagged: int = 0


class AlertCounts(BaseModel):
    open: int
    unread: int


class StatsOut(BaseModel):
    days: int
    total_respondents: int  # distinct people in the selected range
    all_time_respondents: int
    total_responses: int
    average_score: float | None
    split: CategorySplit
    daily: list[DayPoint]
    projection: list[ProjectedPoint]
    trend_per_day: float | None  # slope of the fitted line, in score points per day
    alerts: AlertCounts
    sentiment: SentimentSplit


class ResponseOut(BaseModel):
    id: int
    created_at: datetime
    channel: Channel
    q1: int
    q2: int
    q3: int
    mean: float
    category: Category
    comment: str | None
    customer_name: str
    customer_email: str | None
    customer_phone: str | None
    alert_status: AlertStatus | None
    ai_sentiment: Sentiment | None
    ai_topics: list[str]

    @classmethod
    def from_response(cls, response: FeedbackResponse) -> "ResponseOut":
        customer = response.customer
        return cls(
            id=response.id,
            created_at=response.created_at,
            channel=response.channel,
            q1=response.q1,
            q2=response.q2,
            q3=response.q3,
            mean=float(response.mean),
            category=response.category,
            comment=response.comment,
            customer_name=customer.name,
            customer_email=customer.email,
            customer_phone=customer.phone,
            alert_status=response.alert.status if response.alert else None,
            ai_sentiment=response.ai_sentiment,
            ai_topics=response.ai_topics or [],
        )


class ResponsePage(BaseModel):
    items: list[ResponseOut]
    total: int  # matches across all pages, for "showing 20 of 134"


# ---------- AI assistance ----------


class AiStatusOut(BaseModel):
    enabled: bool
    demo: bool  # True = keyword-rule stand-in, not real AI


class SummaryOut(FeedbackSummary):
    days: int
    comments_used: int  # how many comments the AI read...
    comments_total: int  # ...out of how many in the period (we say so if it's not all)
    generated_at: datetime


class ReplyIn(BaseModel):
    """What the care rep actually sends, after reading and editing any AI draft."""

    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
