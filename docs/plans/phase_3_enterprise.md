# Phase 3: Enterprise ("Companies Pay For This")

## Goal
Add the heavy enterprise features required for large organizations, security compliance, and non-technical stakeholders.

## Feature Breakdown
1. **Enterprise Secrets Providers**
   - Pluggable architecture to fetch secrets directly from AWS Secrets Manager, HashiCorp Vault, and Azure Key Vault.
2. **Accessibility Testing (a11y)**
   - Integrate `axe-core` via Playwright to automatically flag WCAG violations during the test flow.
3. **FastAPI & Next.js Dashboard**
   - Move beyond the CLI. Build a local web server (FastAPI) that serves a beautiful Next.js dashboard to view historical test runs, metrics, and manage goal files.
4. **AI Test Case Generation**
   - Allow users to paste a Jira User Story or PRD into the CLI, and have the LLM automatically generate the Markdown goal files for it.

## Success Criteria
- Users can view tests in a browser dashboard.
- Secrets can be pulled securely from AWS/Vault.
- WCAG accessibility reports are included in the test outputs.
