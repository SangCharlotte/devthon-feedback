"""Fill the dev database with realistic sample feedback so the dashboard has history.

    docker compose exec backend python -m app.seed            # 60 days of data
    docker compose exec backend python -m app.seed --days 90

Sample customers use @seed.companyx.test addresses; running it again replaces only them.
Their comments are tagged by the offline demo tagger, so the topic charts have data.
"""

import argparse
import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select

from app import ai_demo
from app.database import SessionLocal
from app.models import Alert, AlertStatus, Channel, Customer, FeedbackResponse, Segment
from app.scoring import score_answers

FIRST = ["Akinyi", "Baraka", "Chebet", "Wanjiru", "Otieno", "Njeri", "Kamau", "Atieno", "Mwangi"]
LAST = ["Odhiambo", "Kiprop", "Mutua", "Wambui", "Ochieng", "Kariuki", "Njoroge", "Achieng"]
COMMENTS = [
    None,
    None,
    None,
    "Great coverage",
    "Colour faded fast",
    "Fast delivery",
    "Peeling",
    "Too expensive for one coat",
    "Delivery was late again",
    "Smooth finish, love it",
    "Strong smell for days",
    "Staff were helpful with advice",
    "Lid leaked in the car",
]
# Painters text in from feature phones or use the web form; homeowners use the web form.
# 20 + 11 web respondents is the ~65/35 homeowner/painter web split.
CUSTOMER_KINDS = (
    [(Segment.HOMEOWNER, Channel.WEB)] * 20
    + [(Segment.PAINTER, Channel.WEB)] * 11
    + [(Segment.PAINTER, Channel.SMS)] * 9
)


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

        kinds = rng.sample(CUSTOMER_KINDS, len(CUSTOMER_KINDS))
        customers = [
            Customer(
                name=f"{first} {last}",
                email=f"{first}.{last}{i}@seed.companyx.test".lower(),
                phone=f"+2547{rng.randrange(10**8):08d}",
                segment=segment,
            )
            for i, ((first, last), (segment, _)) in enumerate(
                ((rng.choice(FIRST), rng.choice(LAST)), kind) for kind in kinds
            )
        ]
        channel_of = {id(c): channel for c, (_, channel) in zip(customers, kinds, strict=True)}
        db.add_all(customers)

        count = 0
        now = datetime.now(UTC)
        for days_ago in range(days, 0, -1):
            # Scores drift upwards over time, so the trend line has a story to tell.
            mood = 2.6 + 1.6 * (1 - days_ago / days)
            for _ in range(rng.randint(0, 6)):
                q1, q2, q3 = (max(1, min(5, round(rng.gauss(mood, 1.1)))) for _ in range(3))
                result = score_answers(q1, q2, q3)
                customer = rng.choice(customers)
                comment = rng.choice(COMMENTS)
                tags = ai_demo.tag(comment) if comment else None
                created_at = now - timedelta(days=days_ago, minutes=rng.randrange(600))
                response = FeedbackResponse(
                    customer=customer,
                    q1=q1,
                    q2=q2,
                    q3=q3,
                    mean=Decimal(str(result.mean)),
                    category=result.category,
                    channel=channel_of[id(customer)],
                    comment=comment,
                    created_at=created_at,
                    ai_sentiment=tags.sentiment if tags else None,
                    ai_topics=[t.value for t in tags.topics] if tags else None,
                    ai_tagged_at=created_at if tags else None,
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
