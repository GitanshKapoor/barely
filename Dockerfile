# Use the official Microsoft Playwright image to avoid compiling browser dependencies
FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy

# Set up environment variables
ENV PYTHONUNBUFFERED=1
ENV WORKDIR=/workspace

WORKDIR $WORKDIR

# Install 'uv' for lightning-fast Python package management
RUN pip install uv

# Copy the Barely workspace configurations and packages
COPY pyproject.toml .
COPY packages/ ./packages/
COPY plugins/ ./plugins/

# Sync the workspace (this creates a .venv inside the container and installs Barely)
RUN uv sync

# Add the virtual environment to the PATH so the 'barely' CLI is available globally
ENV PATH="$WORKDIR/.venv/bin:$PATH"

# Set the default entrypoint to the CLI
ENTRYPOINT ["barely"]
