import pytest

from app.scoring import Category, score_answers


def test_brief_example_is_detractor():
    # (2 + 3 + 2) / 3 = 2.33 -> Detractor -> alert
    result = score_answers(2, 3, 2)
    assert result.mean == 2.33
    assert result.category is Category.DETRACTOR
    assert result.needs_alert


@pytest.mark.parametrize("answers", [(3, 3, 3), (1, 3, 5), (2, 2, 5), (4, 4, 1)])
def test_exact_three_is_passive(answers):
    result = score_answers(*answers)
    assert result.mean == 3.0
    assert result.category is Category.PASSIVE
    assert not result.needs_alert


@pytest.mark.parametrize(
    ("answers", "expected"),
    [
        ((2, 3, 3), Category.DETRACTOR),  # 2.67 - just below 3
        ((4, 3, 3), Category.PROMOTER),  # 3.33 - just above 3
        ((1, 1, 1), Category.DETRACTOR),
        ((5, 5, 5), Category.PROMOTER),
    ],
)
def test_boundaries(answers, expected):
    assert score_answers(*answers).category is expected


@pytest.mark.parametrize("bad", [0, 6, -1])
def test_out_of_range_rejected(bad):
    with pytest.raises(ValueError):
        score_answers(bad, 3, 3)
