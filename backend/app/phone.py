import re

# Africa's Talking expects E.164 numbers (+2547XXXXXXXX). Local numbers like
# "0712 345 678" are assumed to be Kenyan; change this for another market.
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
