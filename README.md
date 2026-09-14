# Barely.ai 🤖

Autonomous, AI-driven End-to-End testing engine. Barely replaces brittle Selenium/Cypress selectors with dynamic DOM distillation and LLM reasoning. Just write your goals in plain English Markdown, and Barely will figure out how to click, type, and navigate to accomplish them.

## 🚀 Quickstart (Docker - Recommended)

The easiest way to run the entire Control Plane (API, UI Dashboard, and execution Worker) without installing browser dependencies on your host machine.

1. **Set your API Key**
   Create a `.env` file in the root directory:
   ```bash
   echo "GROQ_API_KEY=gsk_your_key_here" > .env
   ```

2. **Boot the Platform**
   ```bash
   docker compose up --build
   ```

3. **Access the Dashboard**
   Open your browser and navigate to [http://localhost:3000](http://localhost:3000)

---

## 💻 Native Developer Setup (CLI)

If you want to run tests locally, see the browser move in real-time, or contribute to the python engine, use the native setup.

### Prerequisites
- Python 3.9+
- [uv](https://github.com/astral-sh/uv) (Extremely fast Python package manager)
- Node.js (Only required if developing the Next.js UI locally)

### 1. Install Dependencies
Install the workspace packages (Core, CLI, API, Worker):
```bash
uv sync
```

### 2. Install Playwright Browsers
Barely needs Chromium to interact with the web:
```bash
uv run playwright install chromium
```

### 3. Add API Key
```bash
echo "GROQ_API_KEY=gsk_your_key_here" > .env
```

### 4. Run a Test!
Write a test goal in `.barely/goals/example.md`, then run it. Set `--headless=False` if you want to watch the AI take control of a real Chrome window.
```bash
uv run barely run .barely/goals/example.md --headless=False
```

## 🏗 Architecture
This is a standard Monorepo managed by `uv workspaces`:
- `packages/core`: The DOM Distiller, Agent Loop, and VRT Engine.
- `packages/cli`: The terminal interface (`barely run`).
- `packages/api`: The FastAPI Control Plane for queueing jobs.
- `packages/worker`: The execution node that pulls from the queue.
- `packages/ui`: The Next.js SaaS Dashboard.
- `plugins/*`: Drop-in extensions like `reporter-jira` and `reporter-pdf`.
