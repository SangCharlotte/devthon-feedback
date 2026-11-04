from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, read from environment variables (and .env when run locally)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://feedback:change-me@localhost:5432/feedback"
    frontend_origin: str = "http://localhost:3000"
    # Proxies allowed to tell us the visitor's real IP (X-Forwarded-For): Next.js and
    # Caddy, inside Docker's private networks. Anyone else sending that header is ignored.
    trusted_proxies: str = "127.0.0.1,172.16.0.0/12,10.0.0.0/8"

    # Secrets: empty by default so the app still boots without them.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    mail_from: str = "feedback@companyx.test"
    care_team_email: str = ""
    care_team_phone: str = ""  # optional: also SMS the care rep about detractors

    at_username: str = "sandbox"
    at_api_key: str = ""
    at_sender_id: str = ""  # optional shortcode / sender name
    at_webhook_token: str = ""  # shared secret expected on the inbound SMS and USSD callback URLs
    at_ussd_code: str = ""  # e.g. *384*1234#, mentioned in SMS invites when set

    # AI layer (optional). Empty key = AI features switched off; everything else still works.
    ai_provider: Literal["anthropic", "openai"] = "anthropic"
    ai_api_key: str = ""
    ai_model: str = ""  # empty = the provider's default (see app.ai.DEFAULT_MODELS)
    ai_timeout_seconds: float = 30.0
    # Try the AI screens without a key: keyword rules stand in for the AI (clearly labelled).
    ai_demo_mode: bool = False

    # Owner login for the admin dashboard. Hashed into the staff table at startup.
    admin_username: str = "admin"
    admin_password: str = ""
    session_secret: str = ""  # signs login cookies; long random string
    session_hours: int = 8
    cookie_secure: bool = False  # True in staging/production (HTTPS only)

    # Dashboard "days" are calendar days in the company's timezone, not UTC.
    report_timezone: str = "Africa/Nairobi"


@lru_cache
def get_settings() -> Settings:
    return Settings()
