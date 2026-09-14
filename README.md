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

You define the *goal* and the *assertions* in plain English. Barely figures out the *steps* to achieve it.

### Core Capabilities:
- 🧠 **Autonomous AI Execution:** Leverages multi-modal LLMs (Anthropic Claude 3.5 Sonnet, OpenAI, Gemini, Groq) via LiteLLM to analyze the live DOM and execute steps in real-time.
- 🏷️ **Test Suite Tags & Classification:** Categorize test runs (`#smoke`, `#regression`, `#auth`, `#p0`, `#e2e`) with quick-toggle presets and multi-suite filtering.
- 🎯 **Strict Mode & Autonomous Healing:** Toggle between strict locator uniqueness mode and intelligent autonomous self-healing.
- 🖼️ **Autonomous Visual Baselines:** Automatically capture golden viewport snapshots across Desktop, Tablet, iOS, and Android device profiles.
- ⚡ **Zero-Disk Architecture & Action Caching:** 100% of runs, logs, screenshots, and cached action plans persist directly in PostgreSQL. Cached runs execute in milliseconds at $0 model cost.
- 📊 **Executive PDF Reports & Artifact Bundles:** One-click export of print-ready multi-page PDF audit reports and downloadable `.zip` bundles (`REPORT.md`, `report.html`, `run_data.json`).
- 🔄 **Live CI/CD Audit View:** Real-time console log streaming, step-by-step DOM timelines, and one-click re-run & reconfigure modal.

## 🚀 Quickstart

### Option A: Run Full Stack with Docker Compose (Recommended)

Clone the repository and launch the database, control plane API, background worker, and Next.js UI in seconds:

```bash
git clone https://github.com/GitanshKapoor/barely.git
cd barely
docker compose up -d
```

- 🌐 **Web Dashboard:** [http://localhost:3000](http://localhost:3000)
- 🔌 **API Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)

### Option B: Local CLI Installation

```bash
# We recommend using uv for lightning-fast installation
uv pip install barely
```

### 2. Initialize a Workspace
Initialize a `.barely` workspace in your project repository:
```bash
barely init
```

### 3. Write a Test Goal
Create a file at `.barely/goals/checkout.md`:
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

### 4. Run the Agent
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

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
