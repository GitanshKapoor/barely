# Barely.ai 🤖

Autonomous, AI-driven End-to-End testing engine. Barely replaces brittle Selenium/Cypress selectors with dynamic DOM distillation and LLM reasoning. Just write your goals in plain English, and Barely will figure out how to click, type, and navigate to accomplish them.

## 🚀 Quickstart (Docker - Recommended)

The easiest way to run the entire Control Plane (API, UI Dashboard, PostgreSQL Database, and execution Worker) without installing browser dependencies on your host machine.

1. **Set your API Key**
   Barely runs on the industry-leading Claude 3.5 Sonnet model. Create a `.env` file in the root directory:
   ```bash
   echo "ANTHROPIC_API_KEY=sk-ant-your_key_here" > .env
   ```

2. **Boot the Platform**
   ```bash
   docker compose up -d --build
   ```

3. **Access the Dashboard**
   Open your browser and navigate to [http://localhost:3000](http://localhost:3000). The UI will poll the database in real-time, instantly showing you when tests are pending, running, or completed!

---

## 💻 Native Developer Setup (Real-Time Visual Execution)

If you want to watch the browser pop open and see the AI move the mouse in real-time, run the worker natively on your Mac (since Docker runs invisibly without a screen).

### Prerequisites
- Python 3.9+
- [uv](https://github.com/astral-sh/uv) (Extremely fast Python package manager)

### 1. Install Dependencies & Browsers
```bash
uv sync
uv run playwright install chromium
```

### 2. Stop Docker Worker & Start Native Worker
Keep the API, UI, and Database running in Docker, but run the worker locally:
```bash
docker compose stop barely-worker
HEADLESS=false uv run python packages/worker/src/barely_worker/main.py
```
Now, trigger a test from the UI and watch your Mac take over!

## 🏗 Architecture
This is a standard Monorepo managed by `uv workspaces`:
- `barely-db`: Production-grade PostgreSQL database holding test runs and histories.
- `packages/core`: The DOM Distiller, Agent Loop, SQLAlchemy Models, and VRT Engine.
- `packages/cli`: The terminal interface (`barely run`).
- `packages/api`: The FastAPI Control Plane querying Postgres.
- `packages/worker`: The execution node driving the browser.
- `packages/ui`: The Next.js SaaS Dashboard with real-time polling.
- `plugins/*`: Drop-in extensions like `reporter-jira` and `reporter-pdf`.
