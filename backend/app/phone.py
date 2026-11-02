import re

# Normalize input strings to the international E.164 telecommunication formatting standard.
# Enforces standard regional telephone routing prefixes for carrier gateway compatibility.
DEFAULT_COUNTRY_CODE = "254"

_E164 = re.compile(r"\+\d{9,15}")


def normalize_phone(raw: str) -> str:
    number = re.sub(r"[\s\-().]", "", raw)
    if number.startswith("00"):
        number = "+" + number[2:]
    elif number.startswith("0"):
        number = "+" + DEFAULT_COUNTRY_CODE + number[1:]
    elif not number.startswith("+"):
        number = "+" + number

    if not _E164.fullmatch(number):
        raise ValueError("Enter a valid phone number, e.g. 0712 345 678 or +254712345678")
    return number
