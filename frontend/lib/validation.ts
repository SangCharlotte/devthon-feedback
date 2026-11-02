// Client-side checks for instant feedback. The API re-validates everything:
// the browser is never trusted, this only saves the customer a round trip.

export type Details = { name: string; email: string; phone: string; comment: string };
export type DetailErrors = Partial<Record<keyof Details, string>>;

// Keep in sync with backend/app/phone.py.
const DEFAULT_COUNTRY_CODE = "254";
const E164 = /^\+\d{9,15}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(raw: string): string | null {
  let number = raw.replace(/[\s\-().]/g, "");
  if (number.startsWith("00")) number = "+" + number.slice(2);
  else if (number.startsWith("0")) number = "+" + DEFAULT_COUNTRY_CODE + number.slice(1);
  else if (!number.startsWith("+")) number = "+" + number;
  return E164.test(number) ? number : null;
}

export function validateDetails(details: Details): DetailErrors {
  const errors: DetailErrors = {};
  const name = details.name.trim();

  if (!name) errors.name = "Please tell us your name";
  else if (name.length > 100) errors.name = "Please keep your name under 100 characters";
  if (!EMAIL.test(details.email.trim())) errors.email = "Enter a valid email, e.g. jane@example.com";
  if (!normalizePhone(details.phone)) errors.phone = "Enter a valid phone number, e.g. 0712 345 678";
  if (details.comment.length > 1000) errors.comment = "Please keep comments under 1000 characters";

  return errors;
}
