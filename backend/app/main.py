import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app import mailer, sms
from app.auth import sync_owner_on_startup
from app.config import get_settings
from app.database import DbSession
from app.routers import ai, alerts, auth, feedback, insights, staff, ussd
from app.routers import sms as sms_router

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    sync_owner_on_startup()
    _warn_if_replies_wont_be_delivered()
    yield


def _warn_if_replies_wont_be_delivered() -> None:
    if mailer.delivery_mode() == "test":
        log.warning(
            "SMTP_HOST=%s is a local test server: emails are caught there and never "
            "reach customers. Set a real SMTP provider in .env to deliver replies.",
            get_settings().smtp_host,
        )
    if sms.delivery_mode() == "sandbox":
        log.warning("AT_USERNAME=sandbox: SMS replies will not reach real phones.")


app = FastAPI(title="Company X Feedback API", version="0.1.0", lifespan=lifespan)

# Configure cross-origin resources sharing for frontend applications.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)
# Resolve downstream client IP addresses before route processing.
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=get_settings().trusted_proxies)

app.include_router(feedback.router)
app.include_router(alerts.router)
app.include_router(sms_router.router)
app.include_router(auth.router)
app.include_router(insights.router)
app.include_router(ai.router)
app.include_router(staff.router)
app.include_router(ussd.router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness: the process is up. No dependencies, so it's always fast."""
    return {"status": "ok"}


@app.get("/health/db")
def health_db(db: DbSession) -> dict[str, str]:
    """Readiness: we can actually reach Postgres."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    return {"status": "ok", "database": "connected"}
