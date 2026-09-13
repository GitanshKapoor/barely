# Phase 2: Professional ("Teams Use This")

## Goal
Integrate Barely into standard software development lifecycles (CI/CD) and handle advanced testing concepts like visual regression.

## Feature Breakdown
1. **Visual Regression Testing**
   - Save baseline screenshots for specific steps.
   - Use pixel-diffing (e.g., `pixelmatch`) to detect unintended visual changes even if the functional flow passes.
2. **GitHub Actions Integration (`barely-action`)**
   - Create a containerized GitHub Action that can run Barely on Pull Requests.
   - Automatically post test summaries as PR comments.
3. **Parallel Execution**
   - Allow `barely run --all` to execute multiple goals concurrently using Python `asyncio` or multiprocess workers.
4. **Explore Mode**
   - A specialized agent prompt that doesn't follow a strict goal, but actively tries to find broken links, 404s, or console errors on a given domain.

## Success Criteria
- Barely can run in a CI pipeline headlessly.
- A suite of 10 tests runs concurrently in a fraction of the time.
- Visual changes (like a button color changing) trigger a warning.
