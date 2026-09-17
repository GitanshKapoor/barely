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
5. **AI Guardrails, Input Validation & Security Governance**
   - **Pre-Flight Intent Classifier & Token Wastage Prevention**:
     - Reject non-QA inputs before invoking the LLM (e.g., users writing Python code, asking math/essay questions, or uploading raw scripts).
     - Fast regex/schema validation at the API layer: requires a target URL, declarative web actions, and assertion criteria.
     - Saves 100% of LLM tokens and prevents worker queue congestion from off-topic tasks.
   - **Prompt Injection & Command Execution (RCE) Defense**:
     - Strict prevention against prompts attempting to execute system commands (e.g., "run this command on the server", `curl | sh`, `rm -rf`, shell escapes).
     - Hard enforcement of tool whitelist: the agent only possesses browser actions (`click`, `type`, `press_key`, `finish`, `fail`) with zero terminal or OS capabilities.
     - Immutable system prompt boundaries preventing user-goal overrides.
   - **SSRF & Network Boundary Protection**:
     - Block navigation to private IP ranges (`10.0.0.0/8`, `192.168.0.0/16`, `127.0.0.1`), cloud metadata endpoints (`169.254.169.254`), and non-HTTP protocols (`file://`, `gopher://`).
   - **Token Runaway & Loop Detection**:
     - Detect cyclic/repetitive clicks on identical DOM elements to break infinite loops early and conserve tokens.
   - **Credential & PII Redaction**:
     - Mask sensitive input values (passwords, tokens, keys) in DOM extraction, console logs, and step audit records.

## Success Criteria
- Barely can run in a CI pipeline headlessly.
- A suite of 10 tests runs concurrently in a fraction of the time.
- Visual changes (like a button color changing) trigger a warning.
- Non-QA prompts (arbitrary Python scripts, system command execution, off-topic chats) are rejected immediately at the gateway with zero LLM token waste.
- Internal networks and cloud metadata services are protected from SSRF attacks.

