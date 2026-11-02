"""Scoring rules from the brief (section 08).

The mean of the three 1-5 answers decides the category:
    mean < 3  -> DETRACTOR (fires an alert)
    mean == 3 -> PASSIVE
    mean > 3  -> PROMOTER
"""

from dataclasses import dataclass
from enum import StrEnum

MIN_RATING = 1
MAX_RATING = 5
QUESTION_COUNT = 3
PASSIVE_TOTAL = 3 * QUESTION_COUNT  # mean == 3 exactly <=> total == 9


class Category(StrEnum):
    DETRACTOR = "detractor"
    PASSIVE = "passive"
    PROMOTER = "promoter"


@dataclass(frozen=True)
class ScoreResult:
    mean: float
    category: Category

    @property
    def needs_alert(self) -> bool:
        return self.category is Category.DETRACTOR


def score_answers(q1: int, q2: int, q3: int) -> ScoreResult:
    answers = (q1, q2, q3)
    for answer in answers:
        if not MIN_RATING <= answer <= MAX_RATING:
            raise ValueError(f"Each answer must be between {MIN_RATING} and {MAX_RATING}")

    # Compare integer totals instead of float means: 2.9999999 vs 3.0 can never happen.
    total = sum(answers)
    if total < PASSIVE_TOTAL:
        category = Category.DETRACTOR
    elif total == PASSIVE_TOTAL:
        category = Category.PASSIVE
    else:
        category = Category.PROMOTER

    return ScoreResult(mean=round(total / QUESTION_COUNT, 2), category=category)
