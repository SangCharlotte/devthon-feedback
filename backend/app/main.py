from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.config import get_settings
from app.database import DbSession
from app.routers import ai, alerts, auth, feedback, insights, sms, staff

app = FastAPI(title="Company X Feedback API", version="0.1.0")

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
app.include_router(sms.router)
app.include_router(auth.router)
app.include_router(insights.router)
app.include_router(ai.router)
app.include_router(staff.router)


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
