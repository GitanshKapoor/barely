# 🚀 Barely CI/CD Pipeline Integration Guide

**Barely** provides autonomous AI-driven end-to-end testing that can be embedded directly into your engineering team's CI/CD workflows (GitHub Actions, GitLab CI, Jenkins). 

Every time a developer opens a Pull Request or pushes code, Barely autonomously boots a headless browser, executes your natural-language test goals, verifies DOM assertions, files Jira tickets for bugs, and attaches a print-ready **Executive PDF Audit Report** to the build artifacts.

---

## 🔑 Step 1: Configuring GitHub Actions Secrets

Before running Barely in your GitHub Actions workflows, add your AI provider API keys as **Encrypted Repository Secrets**:

1. In your GitHub repository, click **Settings** (in the top tab bar).
2. In the left sidebar, navigate to **Secrets and variables** $\rightarrow$ **Actions**.
3. Under the **Repository secrets** section, click **New repository secret**.
4. Add the following secrets according to the model providers you use:

| Secret Name | Required? | Description |
| :--- | :--- | :--- |
| **`ANTHROPIC_API_KEY`** | Recommended | Anthropic Claude API key (`sk-ant-api03-...`) for Claude Sonnet models. |
| **`OPENAI_API_KEY`** | Optional | OpenAI API key (`sk-proj-...`) for GPT-4o / GPT-4o-mini models. |
| **`GEMINI_API_KEY`** | Optional | Google Gemini API key (`AIzaSy...`) for Gemini 2.0 Flash models. |
| **`SLACK_WEBHOOK_URL`** | Optional | Slack incoming webhook URL for test outcome channel alerts. |
| **`TEAMS_WEBHOOK_URL`** | Optional | Microsoft Teams incoming webhook URL for team channel alerts. |
| **`JIRA_API_TOKEN`** | Optional | Jira API token for automated bug ticket filing on test failures. |

> [!NOTE]
> GitHub Actions automatically masks these secrets in console logs (`***`), preventing API keys from ever leaking into build outputs.

---

## 🛠️ Step 2: GitHub Actions Workflow Recipes

### Recipe A: Pull Request E2E Testing with PDF Report Upload (Recommended)

Copy this workflow to `.github/workflows/barely-tests.yml` in your web application's repository:

```yaml
name: Barely Autonomous AI E2E Tests

on:
  pull_request:
    branches: [ "main", "master" ]
  workflow_dispatch:

jobs:
  e2e-tests:
    name: Run Autonomous AI Tests
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout Source Code
        uses: actions/checkout@v4

      # Step 1: Start your web application (or target preview deployment)
      # Example: Start a local Next.js / React dev server
      - name: Setup Node.js & Start Local App
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install & Launch Web Application
        run: |
          npm ci
          npm run build
          npm start &
          npx wait-on http://localhost:3000 --timeout 60000

      # Step 2: Run Barely using the Official Reusable GitHub Action
      - name: Execute Barely AI Test Goals
        uses: GitanshKapoor/barely@v1
        with:
          # Path to your test goal markdown file(s)
          goal: '.barely/goals/checkout.md'
          # Target URL under test (local preview or deployed staging URL)
          url: 'http://localhost:3000'
          # Optional test context / domain knowledge (credentials, sandbox cards, business rules)
          context: 'User: testuser@example.com / Pass: Secret123! Note: Dismiss cookie banner if shown.'
          # AI Model to use
          model: 'anthropic/claude-sonnet-4-5'
          # Secret AI API key from GitHub Secrets
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          # Optional Slack notifications
          slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}

      # Step 3: Archive & Upload Executive PDF Audit Reports as Build Artifacts
      - name: Upload Barely PDF Audit Report & Screenshots
        uses: actions/upload-artifact@v4
        if: always() # Upload report even if the test failed!
        with:
          name: barely-test-audit-report
          path: |
            .barely/reports/*.pdf
            .barely/reports/report.html
            .barely/screenshots/*.png
          retention-days: 14
```

---

### Recipe B: Scheduled Nightly Regression Testing

Run your entire test suite against your staging environment every night at midnight:

```yaml
name: Barely Nightly Regression Suite

on:
  schedule:
    # Run every night at 00:00 UTC
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  nightly-regression:
    name: Full Staging Regression Suite
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run All Regression Goals
        uses: GitanshKapoor/barely@v1
        with:
          goal: '.barely/goals'
          url: 'https://staging.mycompany.com'
          tags: 'regression'
          model: 'anthropic/claude-sonnet-4-5'
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          # Auto-create Jira bug tickets if regression fails
          jira_domain: 'mycompany.atlassian.net'
          jira_email: 'qa-bot@mycompany.com'
          jira_api_token: ${{ secrets.JIRA_API_TOKEN }}
          jira_project_key: 'BUG'

      - name: Upload Regression Deliverables
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: nightly-audit-deliverables
          path: .barely/reports/
```

---

## 🐍 Option 2: Running via Python CLI in CI (Without Docker Action)

If your CI pipeline prefers running directly on the Ubuntu host without container-in-container nesting:

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Set up Python 3.12
    uses: actions/setup-python@v5
    with:
      python-version: '3.12'

  - name: Install Barely & Chromium
    run: |
      pip install barely
      playwright install --with-deps chromium

  - name: Execute Tests
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    run: |
      barely run \
        --url http://localhost:3000 \
        --goal .barely/goals/login.md \
        --model anthropic/claude-sonnet-4-5 \
        --headless
```

---

## 🦊 Option 3: GitLab CI Integration

For teams using **GitLab CI/CD**, add this to `.gitlab-ci.yml`:

```yaml
stages:
  - test

barely-e2e-test:
  stage: test
  image: python:3.12-slim
  variables:
    # ANTHROPIC_API_KEY is configured in GitLab: Settings > CI/CD > Variables
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
  before_script:
    - apt-get update && apt-get install -y wget curl
    - pip install barely
    - playwright install --with-deps chromium
  script:
    - barely run --url $CI_ENVIRONMENT_URL --goal .barely/goals/checkout.md --headless
  artifacts:
    when: always
    paths:
      - .barely/reports/*.pdf
      - .barely/reports/report.html
    expire_in: 2 weeks
```

---

## 🛡️ PR Gating & Failure Rules

- **Zero Tolerance for Breakages**: If a step fails an assertion (e.g. `Verify "Order Placed" badge is visible`), Barely exits with code `1`, immediately marking the GitHub status check as **Failed** and blocking the PR from being merged.
- **Auto-Healing vs. Strict Mode**: In `.barely/goals/checkout.md`, specify `strict: true` to require exact element matches, or `strict: false` to allow Barely's AI agent to auto-heal minor DOM changes and notify the team via the PDF report.
