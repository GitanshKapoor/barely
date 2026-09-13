<div align="center">

# Barely 🧪

**Declarative AI-driven end-to-end testing for modern web applications.**

[![Python Version](https://img.shields.io/badge/python-3.12%2B-blue.svg)](https://python.org)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

</div>

---

Barely is an open-source AI agent designed to replace manual QA testing. Write your test goals in plain English, and Barely's AI agent will autonomously execute them via Playwright, generate professional deliverables, and file bug tickets. 

No Selenium scripts. No brittle CSS selectors. Just results.

## 🌟 What is Barely?

Traditional end-to-end testing requires teams to write hundreds of lines of brittle automation code that breaks every time a button changes color or a div moves. Barely takes a different approach: **Declarative Goal-Based Testing**.

You define the *goal* and the *assertions* in a simple Markdown file. Barely figures out the *steps* to achieve it.

### Core Capabilities:
- 🧠 **AI Agent Execution:** Uses LLMs (Groq, OpenAI, Anthropic, Gemini) to understand the DOM and interact with the page via Playwright.
- ⚡ **Action Plan Caching:** Once the AI figures out a test, it caches the exact actions. Subsequent runs cost $0 and execute in milliseconds.
- 🐛 **Automated Defect Management:** Auto-creates rich Jira bug tickets with reproduction steps and failure screenshots.
- 📊 **Professional Reporting:** Generates compressed PDF and HTML test reports, mirroring the deliverables of a manual QA team.
- 🔐 **Enterprise Secrets:** Native integration with `.env`, AWS Secrets Manager, and HashiCorp Vault so passwords are never hardcoded.

## 🚀 Getting Started (Coming Soon)

Barely is built for speed and simplicity. It runs locally as a single binary before scaling to the cloud.

### 1. Install Barely
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

## 🗺️ Roadmap

Barely is actively developed in phases. Check out our detailed roadmap in the `docs/plans/` directory:
- [Phase 0: MVP](docs/plans/phase_0_mvp.md) - Core CLI and Agent Loop *(We are here)*
- [Phase 1: Reliability](docs/plans/phase_1_reliability.md) - Caching, PDF Reports, Jira
- [Phase 2: Professional](docs/plans/phase_2_professional.md) - CI/CD, Visual Regression
- [Phase 3: Enterprise](docs/plans/phase_3_enterprise.md) - Vault, Dashboards, Accessibility
- [Phase 4: Platform](docs/plans/phase_4_platform.md) - Cloud Execution, Multi-tenant

## 🤝 Contributing

We welcome contributions! Whether you're fixing bugs, adding new features, or improving documentation, please feel free to open a Pull Request. 

See our [Contributing Guide](CONTRIBUTING.md) (coming soon) for more details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
