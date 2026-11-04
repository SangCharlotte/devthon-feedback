"""add customer segment

Revision ID: 5e9b1d7c2a40
Revises: a3c810577e9a
Create Date: 2026-11-04 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5e9b1d7c2a40"
down_revision: str | None = "a3c810577e9a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column(
            "segment",
            sa.Enum(
                "homeowner",
                "painter",
                name="segment",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="homeowner",
            nullable=False,
        ),
    )
    # SMS is the feature-phone channel for painters, so anyone who has texted is one.
    op.execute(
        "UPDATE customers SET segment = 'painter' "
        "WHERE id IN (SELECT customer_id FROM responses WHERE channel = 'sms')"
    )


def downgrade() -> None:
    op.drop_column("customers", "segment")
