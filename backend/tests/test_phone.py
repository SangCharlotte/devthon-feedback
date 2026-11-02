import pytest

from app.phone import normalize_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0712345678", "+254712345678"),
        ("0712 345 678", "+254712345678"),
        ("+254 712-345-678", "+254712345678"),
        ("254712345678", "+254712345678"),
        ("00254712345678", "+254712345678"),
    ],
)
def test_normalizes_to_e164(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "12", "07123abc78", "+1234567890123456"])
def test_rejects_invalid(raw):
    with pytest.raises(ValueError):
        normalize_phone(raw)
