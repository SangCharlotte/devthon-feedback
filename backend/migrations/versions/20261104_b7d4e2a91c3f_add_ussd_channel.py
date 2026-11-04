"""add ussd channel

Revision ID: b7d4e2a91c3f
Revises: 5e9b1d7c2a40
Create Date: 2026-11-04 12:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "b7d4e2a91c3f"
down_revision: str | None = "5e9b1d7c2a40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("ck_responses_channel"), "responses", type_="check")
    op.create_check_constraint("channel", "responses", "channel IN ('web', 'sms', 'ussd')")


def downgrade() -> None:
    # USSD answers came from feature phones, like SMS: keep them rather than delete them.
    op.execute("UPDATE responses SET channel = 'sms' WHERE channel = 'ussd'")
    op.drop_constraint(op.f("ck_responses_channel"), "responses", type_="check")
    op.create_check_constraint("channel", "responses", "channel IN ('web', 'sms')")
