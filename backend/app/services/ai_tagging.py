"""Tag comments with sentiment + topics in the background, after feedback is saved.

    docker compose exec backend python -m app.services.ai_tagging   # backfill old comments

The feedback is already committed when this runs, so an AI failure can only mean
"no tags yet" - never a lost response (brief rule 03).
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import select

from app import ai
from app.database import SessionLocal
from app.models import FeedbackResponse

log = logging.getLogger(__name__)


def tag_response(response_id: int) -> bool:
    """Background task. Returns True if tags were saved. Never raises."""
    try:
        with SessionLocal() as db:
            response = db.get(FeedbackResponse, response_id)
            if response is None or not response.comment or not ai.is_enabled():
                return False  # nothing to tag: don't spend money on an empty comment
            tags = ai.tag_comment(response.comment)
            response.ai_sentiment = tags.sentiment
            response.ai_topics = [topic.value for topic in tags.topics]
            response.ai_tagged_at = datetime.now(UTC)
            db.commit()
            return True
    except ai.AIUnavailable as exc:
        log.info("Response %s left untagged: %s", response_id, exc)
    except Exception:
        log.exception("Unexpected error tagging response %s", response_id)
    return False


def backfill(limit: int = 200) -> int:
    """Tag older comments that have no tags yet, newest first."""
    with SessionLocal() as db:
        ids = db.scalars(
            select(FeedbackResponse.id)
            .where(FeedbackResponse.comment.is_not(None), FeedbackResponse.ai_tagged_at.is_(None))
            .order_by(FeedbackResponse.created_at.desc())
            .limit(limit)
        ).all()
    return sum(tag_response(response_id) for response_id in ids)


if __name__ == "__main__":
    if not ai.is_enabled():
        raise SystemExit("Set AI_API_KEY in .env first.")
    print(f"Tagged {backfill()} comments.")
