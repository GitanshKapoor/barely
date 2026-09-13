# Phase 1: Reliability ("It Works Consistently")

## Goal
Transform the MVP into a robust tool that QA engineers can trust. Eliminate flakiness, reduce LLM API costs, and generate professional deliverables.

## Feature Breakdown
1. **Action Plan Caching (Cost & Speed Optimizer)**
   - Hash the DOM state and Goal.
   - If a test passes, save the sequence of Playwright locators/actions.
   - On next run, try the cached actions *first* (fast, $0 cost). Only fall back to AI if an action fails (e.g., UI changed).
2. **Anti-Flakiness Engine**
   - Implement exponential backoff for elements that haven't loaded yet.
   - Implement multi-vote validation (ask the LLM twice if it's unsure about a pass/fail state).
3. **Secrets Management**
   - Parse `{{secret:KEY}}` syntax in goal files.
   - Load values from `.env` and environment variables.
   - Mask secret values in console logs, DB, and HTML reports.
4. **PDF Report Generation**
   - Use `reportlab` or `weasyprint` to convert the test results into a polished, professional PDF document.
5. **Jira Integration**
   - Auto-create a Bug ticket via Jira REST API on test failure.
   - Include reproduction steps and attach failure screenshots automatically.

## Success Criteria
- Running a test a second time uses the cache (completes in < 5 seconds instead of 30+ seconds).
- Secrets are never leaked in logs.
- Test failures automatically generate Jira tickets.
