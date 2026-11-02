# One image for dev, CI and production. Dev/CI pass INSTALL_DEV=true to add pytest + ruff.
FROM python:3.13-slim

# Don't write .pyc files; flush logs straight to the terminal.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first so this layer is cached between code changes.
COPY requirements.txt requirements-dev.txt ./
ARG INSTALL_DEV=false
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_DEV" = "true" ]; then pip install --no-cache-dir -r requirements-dev.txt; fi

COPY . .

# Run as an unprivileged user, not root.
RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
# Docker (and Compose's --wait) mark the container unhealthy if /health stops answering.
# Generous timeout: on a busy small server even starting the probe can take seconds.
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --start-interval=2s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"
# --no-proxy-headers: the app itself decides which proxies to believe (TRUSTED_PROXIES).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
