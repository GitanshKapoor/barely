# ==========================================
# 1. BUILDER STAGE (Compiles dependencies)
# ==========================================
FROM python:3.12-slim AS builder

ENV PYTHONUNBUFFERED=1
ENV UV_PROJECT_ENVIRONMENT=/opt/.venv
ENV UV_LINK_MODE=copy
ENV PATH="/opt/.venv/bin:$PATH"
WORKDIR /workspace

# Install uv package manager
RUN pip install --no-cache-dir uv

# Copy workspace code
COPY pyproject.toml .
COPY packages/ ./packages/
COPY plugins/ ./plugins/

# Sync dependencies into /opt/.venv
RUN uv sync --all-packages

# ==========================================
# 2. API STAGE (Ultra-lightweight Control Plane)
# ==========================================
FROM python:3.12-slim AS api

ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/.venv/bin:$PATH"
WORKDIR /workspace

# Only copy the compiled python environment and code from builder
COPY --from=builder /opt/.venv /opt/.venv
COPY --from=builder /workspace /workspace

# No browsers installed! This image will be tiny.
ENTRYPOINT [""]

# ==========================================
# 3. WORKER STAGE (Includes Chromium only)
# ==========================================
FROM python:3.12-slim AS worker

ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/.venv/bin:$PATH"
WORKDIR /workspace

COPY --from=builder /opt/.venv /opt/.venv
COPY --from=builder /workspace /workspace

# Install ONLY Chromium and its minimal OS dependencies to save massive space
# We avoid installing Firefox or WebKit, shaving gigabytes off the image size.
RUN apt-get update && /opt/.venv/bin/python3 -m playwright install chromium --with-deps \

    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /root/.cache/ms-playwright/webkit* \
    && rm -rf /root/.cache/ms-playwright/firefox*

ENTRYPOINT [""]
