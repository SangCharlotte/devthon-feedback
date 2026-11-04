from alembic import command
from sqlalchemy import text

BEFORE_SEGMENTS = "a3c810577e9a"


def test_segment_migration_backfills_painters_from_sms_history(engine, db_session, alembic_cfg):
    command.downgrade(alembic_cfg, BEFORE_SEGMENTS)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO customers (id, name) VALUES "
                    "(1, 'Web only'), (2, 'SMS only'), (3, 'Both'), (4, 'No answers')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO responses (customer_id, q1, q2, q3, mean, category, channel) "
                    "VALUES (1, 4, 4, 4, 4, 'promoter', 'web'), (2, 4, 4, 4, 4, 'promoter', 'sms'),"
                    " (3, 4, 4, 4, 4, 'promoter', 'web'), (3, 2, 2, 2, 2, 'detractor', 'sms')"
                )
            )
    finally:
        command.upgrade(alembic_cfg, "head")

    with engine.connect() as conn:
        segments = dict(conn.execute(text("SELECT name, segment FROM customers")).all())
    assert segments == {
        "Web only": "homeowner",
        "SMS only": "painter",
        "Both": "painter",
        "No answers": "homeowner",
    }
