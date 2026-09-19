# Contributing to Barely

Thank you for your interest in contributing to **Barely**! We are building an open-source, autonomous AI testing platform that replaces brittle manual QA with declarative natural-language test goals, visual verification, and enterprise cloud orchestration.

Whether you're fixing a bug, adding support for a new AI model provider, improving documentation, or creating automated deployment integrations, your contributions are warmly welcomed.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Monorepo Architecture](#monorepo-architecture)
3. [Local Development Setup](#local-development-setup)
4. [Development Workflow](#development-workflow)
5. [Coding & Security Standards](#coding--security-standards)
6. [Testing & Quality Assurance](#testing--quality-assurance)
7. [Submitting a Pull Request](#submitting-a-pull-request)
8. [Reporting Issues & Feature Requests](#reporting-issues--feature-requests)

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please treat all maintainers, contributors, and community members with respect, kindness, and professionalism.

---

## Monorepo Architecture

Barely is structured as a multi-package monorepo:

```
barely/
├── packages/
│   ├── core/         # Shared domain models, agent loop, SQLite/PostgreSQL DB,
│   │                 # AES-256 Fernet secrets vault, dynamic LLM provider sync,
│   │                 # and Jira/GitHub/Slack/Teams integrations
│   ├── api/          # FastAPI control plane service (REST endpoints, WebSocket logs,
│   │                 # PDF export, and runner orchestration)
│   ├── worker/       # Background execution engine running Playwright & Chromium
│   │                 # in non-root sandboxed containers
│   └── ui/           # Next.js 16 (App Router) + Tailwind CSS + Lucide Icons dashboard
├── charts/
│   └── barely/       # Production-ready Kubernetes Helm chart (v3) with NGINX Ingress,
│                     # HPA, zero-trust NetworkPolicies, and External Secrets (ESO)
├── deploy/
│   ├── docker/       # Hardened Docker Compose deployment configuration
│   ├── terraform/    # AWS ECS Fargate Terraform module with private ALB & Cloud Map
│   └── ci-cd/        # GitHub Actions workflows and CI/CD integration guides
└── docs/             # Interactive documentation, landing page, and sitemap
```

---

## Local Development Setup

### Prerequisites

- **Python**: 3.11+ (Python 3.12 recommended)
- **Node.js**: 20+ and `npm` or `pnpm`
- **Docker**: Docker Desktop or Docker Engine with Docker Compose v2+
- **Playwright**: For local browser automation execution

### 1. Clone the Repository

```bash
git clone https://github.com/GitanshKapoor/barely.git
cd barely
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Configure your LLM API keys in `.env` (Anthropic, OpenAI, Groq, or Google Gemini).

### 3. Launching Dependencies with Docker Compose

To run the full stack locally (PostgreSQL, Control Plane API, Background Worker, and Next.js Web UI):

```bash
docker compose up -d
```

- Web UI: [http://localhost:3000](http://localhost:3000)
- API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 4. Running the Frontend Locally (Standalone)

```bash
cd packages/ui
npm install
npm run dev
```

### 5. Running Python Services Locally

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e packages/core -e packages/api -e packages/worker
```

---

## Development Workflow

### Branching Strategy

- Develop all features and bug fixes on dedicated branches branched off `main`:
  - `feat/feature-name` for new capabilities
  - `fix/bug-description` for bug fixes
  - `docs/topic-name` for documentation improvements
  - `refactor/scope` for internal refactoring

### Conventional Commits

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat(scope): add automated GitHub defect filing`
- `fix(worker): handle Groq API key mismatch on fallback`
- `docs(readme): update deployment guide references`
- `test(core): add unit tests for secret encryption and dispatcher`
- `refactor(ui): convert modal configurator to responsive two-column grid`

---

## Coding & Security Standards

### 1. Security & Zero-Leak Credential Isolation

- **Never hardcode secrets**: API keys, tokens, and webhooks must never be committed to Git or printed to standard logs.
- **AES-256 Fernet Encryption**: All integration credentials stored in PostgreSQL must be encrypted via `barely_core.crypto`.
- **Masking in UI & API**: Always use `mask_secret()` before returning credentials to API responses or rendering them in frontend components.
- **Non-Root Execution**: Dockerfiles and Kubernetes pod manifests must strictly execute under UID `10001:10001` with `capabilities: drop: ["ALL"]`.

### 2. Standalone Testing Guarantee

- **Zero-overhead default**: When Jira, GitHub, Slack, or Teams integrations are not configured or toggled off, tests must run with **0ms latency penalty** and **zero external network requests**.

### 3. Python Standards

- Follow PEP 8 guidelines.
- Always include type annotations (`typing` module) for function arguments and return types.
- Integrations must prefer standard library modules (e.g. `urllib.request`) to keep core dependency trees lean.

### 4. TypeScript & Frontend Standards

- Next.js 16 App Router best practices.
- Strict TypeScript typing — do not introduce untyped `any` where domain interfaces apply.
- Use **Lucide React** icons for UI controls. Avoid cartoon emojis in dashboards.
- Use Tailwind CSS design tokens matching the existing dark-mode design system.

---

## Testing & Quality Assurance

All contributions must pass automated tests and type checks before being merged.

### Running Backend Unit Tests

Run the full unit test suite:

```bash
PYTHONPATH=packages/core/src python3 -m unittest discover -s packages/core/tests
```

### Running Frontend Typechecks & Build

Validate TypeScript and compile Next.js:

```bash
cd packages/ui
npx tsc --noEmit
npm run build
```

---

## Submitting a Pull Request

1. **Keep PRs Focused**: Address a single problem or feature per Pull Request.
2. **Include Tests**: Add unit tests in `packages/core/tests` for new logic or bug fixes.
3. **Verify Documentation**: If modifying APIs or deployment manifests, update relevant README files in `deploy/` or `charts/`.
4. **Open a PR**:
   - Push your branch to GitHub and create a Pull Request against `main`.
   - Provide a concise summary of changes, problem statement, and verification steps.

---

## Reporting Issues & Feature Requests

- **Bug Reports**: Open an issue detailing steps to reproduce, expected vs. actual behavior, and relevant anonymized console logs.
- **Feature Requests**: Describe the use case, proposed API or UI changes, and how it benefits the broader testing community.

Thank you for helping make **Barely** the most reliable autonomous testing engine for modern engineering teams!
