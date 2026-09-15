<div align="center">

<br/>

<img src="assets/logo.png" alt="Barely Logo" width="180" />

<br/>

**Declarative AI-driven end-to-end testing for modern web applications.**

[![Release](https://img.shields.io/badge/release-v1.0%20%22Baby%20Kangaroo%22-0278ff.svg)](https://github.com/GitanshKapoor/barely/releases)
[![Python Version](https://img.shields.io/badge/Python-3.12%2B-3776AB.svg?logo=python&logoColor=white)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-16%20Turbopack-000000.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Playwright](https://img.shields.io/badge/Playwright-1.42%2B-2EAD33.svg?logo=playwright&logoColor=white)](https://playwright.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1.svg?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?logo=github&logoColor=white)](https://github.com/GitanshKapoor/barely/pulls)

</div>

---

Barely is an open-source autonomous AI agent designed to replace manual QA testing. Write your test goals in plain English, and Barely's AI agent will autonomously execute them via Playwright, maintain visual baselines, generate professional deliverables, and auto-heal dynamic selectors. 

<img src="assets/banner.png" alt="Barely Banner" width="100%" />

## 🌟 What is Barely?

Traditional end-to-end testing requires teams to write hundreds of lines of brittle automation code that breaks every time a button changes color or a div moves. Barely takes a different approach: **Declarative Goal-Based Autonomous QA**.

You define the *test intent* and *assertions* in natural language — Barely's autonomous agent figures out the exact steps, elements, and browser actions to achieve and verify it.

### 🌟 Release 1.0 "Baby Kangaroo" Core Capabilities:
- 🧠 **Autonomous AI Execution:** Leverages multi-modal LLMs (Anthropic Claude 3.5 Sonnet, OpenAI, Gemini, Groq) via LiteLLM to analyze the live DOM and execute steps via Playwright.
- ⚡ **Action Plan Caching:** Once the AI figures out a test, it caches the exact actions directly in PostgreSQL. Subsequent runs cost $0 and execute in milliseconds.
- 🏷️ **Test Suite Tags & Classification:** Categorize test runs (`#smoke`, `#regression`, `#auth`, `#p0`, `#e2e`) with quick-toggle presets and multi-suite filtering.
- 🎯 **Strict Mode & Autonomous Auto-Healing:** Strict locator uniqueness enforcement or resilient autonomous auto-healing for dynamic selectors.
- 🖼️ **Autonomous Visual Baselines:** Capture and preview golden UI viewport snapshots across Desktop, Tablet, iOS, and Android device profiles.
- 📊 **Executive PDF Reports & Artifact Bundles:** One-click export of print-ready multi-page PDF audit reports and downloadable `.zip` bundles (`REPORT.md`, `report.html`, `run_data.json`) with structured 4-tier step auditing (Target Goal Step, AI Agent Reasoning, Human-Readable Action Executed, and Viewport Snapshot).
- 🧩 **Human-Readable Element Abstraction:** Automatically translates low-level DOM IDs into clean, business-level UI labels (e.g. `Clicked "Google Search" button`, `Typed 'Gitansh Kapoor' into "Search" input field`) for non-technical stakeholders.
- 🔄 **Live CI/CD Audit Timeline:** Real-time console log streaming, step-by-step DOM timelines, and one-click re-run & reconfigure modal.
- 🗄️ **Zero-Disk Runtime Architecture:** 100% of runs, logs, screenshots, and cached action plans persist directly in PostgreSQL.

## 🗺️ Coming in Release 2.0 (Roadmap)
- 🐛 **Automated Defect Management (Jira / GitHub Issues):** Auto-create rich bug tickets with reproduction steps, error logs, and failure screenshots.
- 🔐 **Enterprise Secrets Management:** Native integration with AWS Secrets Manager, HashiCorp Vault, and encrypted secret stores so credentials are never hardcoded.
- ☁️ **Cloud-Native Kubernetes (K8s) & AWS ECS Integration:** Production-ready Helm charts, Kubernetes Operator / pod autoscalers, and AWS ECS task definitions for horizontally orchestrating agent runners at enterprise cloud scale.
- 🤝 **Distributed Multi-Agent Fleet:** Coordinated fleet of parallel autonomous agents executing across sharded test suites.
- 🔔 **Real-Time Webhook & Slack Alerts:** Instant notifications on test completions, visual regressions, and pipeline failures.

## 🚀 Getting Started

Barely is built for speed and simplicity. It can be launched instantly with Docker Compose or installed locally as a Python package.

### Option A: Quickstart with Docker Compose (Recommended)

Clone the repository and launch the full platform (PostgreSQL, Control Plane API, Background Worker, and Next.js UI) in seconds:

```bash
git clone https://github.com/GitanshKapoor/barely.git
cd barely
cp .env.example .env    # Configure your LLM API keys
docker compose up -d
```

Once running, access:
- 🌐 **Web Dashboard:** [http://localhost:3000](http://localhost:3000)
- 🔌 **API Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Option B: Local CLI Installation

Install Barely as a standalone Python CLI:

```bash
# We recommend using uv for lightning-fast installation
uv pip install barely
```

**1. Initialize a Workspace**
```bash
barely init
```

**2. Write a Test Goal** (`.barely/goals/checkout.md`)
```markdown
---
tags: [smoke, e2e]
timeout: 120
---
# Test Checkout Flow
1. Navigate to the homepage
2. Search for "Laptop"
3. Add the first result to the cart
4. Verify the cart badge displays "1"
```

**3. Run the Agent**
```bash
barely run --url https://staging.myapp.com --goal .barely/goals/checkout.md
```

## 📚 Documentation

Documentation is currently a work in progress. Detailed guides on architecture, writing goals, and CI/CD integration will be published soon.

## 💬 Community

- **Discord:** Join our community server (Coming soon)
- **Twitter:** Follow us for updates (Coming soon)

## 🤝 Contributing

We welcome contributions! Whether you're fixing bugs, adding new features, or improving documentation, please feel free to open a Pull Request. 

See our [Contributing Guide](CONTRIBUTING.md) (coming soon) for more details.

## 👨‍💻 Author & Creator

Created and maintained by **Gitansh Kapoor**:
- 💼 **LinkedIn:** [linkedin.com/in/gitansh16k](https://www.linkedin.com/in/gitansh16k)
- 🐙 **GitHub:** [@GitanshKapoor](https://github.com/GitanshKapoor)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
