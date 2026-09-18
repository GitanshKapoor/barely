# ==============================================================================
# 1. BUILDER STAGE: Compiles dependencies with layer caching
# ==============================================================================
FROM python:3.12-slim AS builder

# Prevent python from writing pyc files and buffering stdout
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/.venv \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PATH="/opt/.venv/bin:$PATH"

WORKDIR /workspace

# Install uv via pre-built static binary (avoids pip overhead and cache pollution)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Layer Caching Step 1: Copy workspace root and subpackage dependency manifests first
COPY pyproject.toml uv.lock ./
COPY packages/api/pyproject.toml ./packages/api/
COPY packages/cli/pyproject.toml ./packages/cli/
COPY packages/core/pyproject.toml ./packages/core/
COPY packages/worker/pyproject.toml ./packages/worker/
COPY plugins/reporter-jira/pyproject.toml ./plugins/reporter-jira/
COPY plugins/reporter-pdf/pyproject.toml ./plugins/reporter-pdf/

# Layer Caching Step 2: Pre-install third-party dependencies without workspace packages
# When source code changes, this heavy layer is REUSED from cache (0 downloads, 0s build time!)
RUN uv sync --frozen --all-packages --no-install-workspace --no-dev

# Layer Caching Step 3: Copy only the application source code
COPY packages/ ./packages/
COPY plugins/ ./plugins/

# Layer Caching Step 4: Complete workspace installation (< 1s execution)
RUN uv sync --frozen --all-packages --no-dev \
    && find /opt/.venv -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# ==============================================================================
# 2. API STAGE: Ultra-lean Control Plane (No browsers, zero compiler tools)
# ==============================================================================
FROM python:3.12-slim AS api

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/.venv/bin:$PATH"

WORKDIR /workspace

# Copy isolated virtualenv and workspace packages from builder
COPY --from=builder /opt/.venv /opt/.venv
COPY --from=builder /workspace /workspace

# Create unprivileged non-root user (UID 10001, GID 10001) to prevent privilege escalation
RUN groupadd -g 10001 barely \
    && useradd -u 10001 -g barely -s /bin/bash -m -d /home/barely barely \
    && chown -R 10001:10001 /workspace /opt/.venv /home/barely

USER 10001
EXPOSE 8000
CMD ["/opt/.venv/bin/uvicorn", "barely_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "packages/api/src"]

# ==============================================================================
# 3. WORKER STAGE: Minimal Autonomous Runner (Chromium-only + OS libraries)
# ==============================================================================
FROM python:3.12-slim AS worker

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PATH="/opt/.venv/bin:$PATH"

WORKDIR /workspace

# Copy isolated virtualenv and workspace packages from builder
COPY --from=builder /opt/.venv /opt/.venv
COPY --from=builder /workspace /workspace

# Install ONLY Chromium and its required minimal OS libraries
# Explicitly purge apt lists, package caches, and temporary files to minimize image layers
# Create unprivileged non-root user (UID 10001) for strict container sandbox isolation
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && /opt/.venv/bin/python3 -m playwright install chromium --with-deps \
    && apt-get purge -y --auto-remove curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /root/.cache \
    && rm -rf /ms-playwright/firefox* /ms-playwright/webkit* \
    && groupadd -g 10001 barely \
    && useradd -u 10001 -g barely -s /bin/bash -m -d /home/barely barely \
    && mkdir -p /home/barely/.cache /tmp/barely \
    && chown -R 10001:10001 /workspace /opt/.venv /ms-playwright /home/barely /tmp/barely \
    && chmod -R 755 /ms-playwright

USER 10001
CMD ["/opt/.venv/bin/python3", "packages/worker/src/barely_worker/main.py"]
