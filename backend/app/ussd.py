"""USSD questionnaire: the same three questions on menus, for any phone, no data needed.

Africa's Talking calls our callback once per screen with `text` holding every answer
so far, joined by '*' ("4*5" after two answers). That makes the session stateless:
each request replays `text` to work out which screen comes next.
"""

from dataclasses import dataclass

from app.scoring import Category

MAX_COMMENT = 1000

_SCALE = "1 Terrible\n2 Poor\n3 Okay\n4 Good\n5 Excellent"
_QUESTIONS = (
    "Rate your experience with our product:",
    "Rate our customer care:",
    "Are you happy with the product?",
)
_RATINGS = {"1", "2", "3", "4", "5"}


@dataclass(frozen=True)
class Prompt:
    """Ask the next question: shown with 'CON', so the session stays open."""

    text: str


@dataclass(frozen=True)
class Complete:
    q1: int
    q2: int
    q3: int
    comment: str | None


def next_step(text: str) -> Prompt | Complete:
    parts = text.split("*") if text else []
    ratings: list[int] = []
    last_was_invalid = False
    used = 0
    for part in parts:
        if len(ratings) == 3:
            break
        used += 1
        # A wrong key re-asks the same question instead of ending the session.
        last_was_invalid = part.strip() not in _RATINGS
        if not last_was_invalid:
            ratings.append(int(part.strip()))

    if len(ratings) < 3:
        retry = "Please choose 1 to 5.\n" if last_was_invalid else ""
        step = len(ratings)
        return Prompt(f"Company X feedback ({step + 1}/3)\n{retry}{_QUESTIONS[step]}\n{_SCALE}")

    rest = parts[used:]
    if not rest:
        return Prompt("Thanks! Anything else to tell us?\nType a comment, or 0 to skip")
    comment = "*".join(rest).strip()  # a comment may itself contain '*'
    return Complete(*ratings, comment=None if comment in ("", "0") else comment[:MAX_COMMENT])


def goodbye(mean: float, category: Category) -> str:
    if category == Category.DETRACTOR:
        return (
            f"Thank you. You rated us {mean:.2f}/5. "
            "Sorry we let you down: our care team will call you soon."
        )
    return f"Thank you! You rated us {mean:.2f}/5. Happy painting! - Company X"
