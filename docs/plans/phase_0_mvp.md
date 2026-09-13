# Phase 0: MVP ("It Works")

## Goal
Establish the core foundation of Barely. A user should be able to run `barely run` on a Markdown goal file, and the agent should drive Playwright to accomplish the goal, resulting in an HTML report.

## Architecture
- **CLI**: `typer` based interface.
- **Agent**: `litellm` (configured for Groq) with a `Plan -> Act -> Observe` loop.
- **Browser**: `playwright` synchronous API.
- **Storage**: `sqlite3` for local run tracking.

## Feature Breakdown
1. **Workspace Initialization (`barely init`)**
   - Scaffolds `.barely/`, `.barely/goals/`, `.barely/runs/`, and `barely.yaml`.
2. **Goal Parser**
   - Parses Markdown files. Extracts YAML frontmatter (tags, timeout) and Markdown body (the steps).
3. **DOM Extraction**
   - Converts the Playwright page state into a simplified Accessibility Tree / Markdown format that the LLM can understand without wasting tokens.
4. **AI Agent Loop**
   - **Plan**: Read goal & current DOM, decide next action.
   - **Act**: Execute Playwright command (click, type, navigate).
   - **Observe**: Take screenshot, verify if goal is met.
5. **Basic Reporting**
   - Outputs a standalone HTML file with the steps taken, screenshots, and pass/fail status.

## Success Criteria
- `barely run .barely/goals/login.md` successfully logs into `saucedemo.com`.
- HTML report is generated with screenshots of every step.
