from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    false,
    func,
    true,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.ai import Sentiment
from app.database import Base
from app.scoring import Category


class Channel(StrEnum):
    WEB = "web"
    SMS = "sms"
    USSD = "ussd"


class Segment(StrEnum):
    HOMEOWNER = "homeowner"
    PAINTER = "painter"


class AlertStatus(StrEnum):
    OPEN = "open"
    RESOLVED = "resolved"


def _string_enum(enum_cls: type[StrEnum], name: str) -> Enum:
    """Store an enum as VARCHAR + CHECK constraint, using the lowercase values."""
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=20,
        values_callable=lambda members: [m.value for m in members],
    )


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    # Support phone-only identification for inbound SMS channels
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20), index=True)
    segment: Mapped[Segment] = mapped_column(
        _string_enum(Segment, "segment"),
        default=Segment.HOMEOWNER,
        server_default=Segment.HOMEOWNER.value,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    responses: Mapped[list["FeedbackResponse"]] = relationship(back_populates="customer")


class FeedbackResponse(Base):
    __tablename__ = "responses"
    __table_args__ = (
        CheckConstraint("q1 BETWEEN 1 AND 5", name="q1_range"),
        CheckConstraint("q2 BETWEEN 1 AND 5", name="q2_range"),
        CheckConstraint("q3 BETWEEN 1 AND 5", name="q3_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    q1: Mapped[int] = mapped_column(SmallInteger)
    q2: Mapped[int] = mapped_column(SmallInteger)
    q3: Mapped[int] = mapped_column(SmallInteger)
    mean: Mapped[Decimal] = mapped_column(Numeric(3, 2))
    category: Mapped[Category] = mapped_column(_string_enum(Category, "category"), index=True)
    channel: Mapped[Channel] = mapped_column(_string_enum(Channel, "channel"))
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    # AI enrichment telemetry fields; nullable to handle asynchronous processing fallbacks
    ai_sentiment: Mapped[Sentiment | None] = mapped_column(_string_enum(Sentiment, "ai_sentiment"))
    ai_topics: Mapped[list[str] | None] = mapped_column(ARRAY(String(20)))
    ai_tagged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    customer: Mapped[Customer] = relationship(back_populates="responses")
    alert: Mapped["Alert | None"] = relationship(back_populates="response")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    response_id: Mapped[int] = mapped_column(ForeignKey("responses.id"), unique=True)
    status: Mapped[AlertStatus] = mapped_column(
        _string_enum(AlertStatus, "status"), default=AlertStatus.OPEN, index=True
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Delivery receipts: NULL means the notification was not (or not yet) delivered.
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sms_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Audit log fields tracking final modification state of care responses
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replied_by: Mapped[str | None] = mapped_column(String(100))
    reply_subject: Mapped[str | None] = mapped_column(String(200))
    reply_body: Mapped[str | None] = mapped_column(Text)

    response: Mapped[FeedbackResponse] = relationship(back_populates="alert")


class Role(StrEnum):
    MANAGER = "manager"
    REP = "rep"


class StaffUser(Base):
    """Internal operational staff profiles for dashboard access control."""

    __tablename__ = "staff"
    __table_args__ = (CheckConstraint("username = lower(username)", name="username_lowercase"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[Role] = mapped_column(_string_enum(Role, "staff_role"), default=Role.REP)
    # Logical deletion flag to preserve historic relationship data.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # Session invalidation sequence counter for token revocation
    session_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
