"""Fill the dev database with realistic sample feedback so the dashboard has history.

    docker compose exec backend python -m app.seed            # 60 days of data
    docker compose exec backend python -m app.seed --days 90

Sample customers use @seed.companyx.test addresses; running it again replaces only them.
"""

import argparse
import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select

from app.database import SessionLocal
from app.models import Alert, AlertStatus, Channel, Customer, FeedbackResponse
from app.scoring import score_answers

FIRST = ["Akinyi", "Baraka", "Chebet", "Wanjiru", "Otieno", "Njeri", "Kamau", "Atieno", "Mwangi"]
LAST = ["Odhiambo", "Kiprop", "Mutua", "Wambui", "Ochieng", "Kariuki", "Njoroge", "Achieng"]
COMMENTS = [None, None, None, "Great coverage", "Colour faded fast", "Fast delivery", "Peeling"]


def seed(days: int) -> int:
    rng = random.Random(42)  # fixed seed: the same "random" data every run
    with SessionLocal() as db:
        sample = select(Customer.id).where(Customer.email.like("%@seed.companyx.test"))
        sample_responses = select(FeedbackResponse.id).where(
            FeedbackResponse.customer_id.in_(sample)
        )
        db.execute(delete(Alert).where(Alert.response_id.in_(sample_responses)))
        db.execute(delete(FeedbackResponse).where(FeedbackResponse.customer_id.in_(sample)))
        db.execute(delete(Customer).where(Customer.id.in_(sample)))

        customers = [
            Customer(
                name=f"{first} {last}",
                email=f"{first}.{last}{i}@seed.companyx.test".lower(),
                phone=f"+2547{rng.randrange(10**8):08d}",
            )
            for i, (first, last) in enumerate(
                (rng.choice(FIRST), rng.choice(LAST)) for _ in range(40)
            )
        ]
        db.add_all(customers)

        count = 0
        now = datetime.now(UTC)
        for days_ago in range(days, 0, -1):
            # Scores drift upwards over time, so the trend line has a story to tell.
            mood = 2.6 + 1.6 * (1 - days_ago / days)
            for _ in range(rng.randint(0, 6)):
                q1, q2, q3 = (max(1, min(5, round(rng.gauss(mood, 1.1)))) for _ in range(3))
                result = score_answers(q1, q2, q3)
                response = FeedbackResponse(
                    customer=rng.choice(customers),
                    q1=q1,
                    q2=q2,
                    q3=q3,
                    mean=Decimal(str(result.mean)),
                    category=result.category,
                    channel=Channel.SMS if rng.random() < 0.25 else Channel.WEB,
                    comment=rng.choice(COMMENTS),
                    created_at=now - timedelta(days=days_ago, minutes=rng.randrange(600)),
                )
                db.add(response)
                if result.needs_alert:
                    # Old alerts were handled already; only the last week is still open.
                    resolved = days_ago > 7
                    db.add(
                        Alert(
                            response=response,
                            status=AlertStatus.RESOLVED if resolved else AlertStatus.OPEN,
                            is_read=resolved,
                            created_at=response.created_at,
                            resolved_at=response.created_at + timedelta(hours=4)
                            if resolved
                            else None,
                        )
                    )
                count += 1
        db.commit()
    return count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--days", type=int, default=60)
    print(f"Seeded {seed(parser.parse_args().days)} sample responses.")
