# Barely CLI

Command-line interface for the Barely AI testing framework. Write tests in plain English, execute them via autonomous AI agents, and get PDF reports, Jira bugs, GitHub issues, and Slack/Teams notifications — all from your terminal.

## Up and Running in 60 Seconds

```bash
# Install (auto-detects your OS)
curl -sSL https://raw.githubusercontent.com/GitanshKapoor/barely/main/install.sh | bash
source .venv/bin/activate

# Configure your AI provider key (hidden prompt — nothing saved to shell history)
barely secret set ANTHROPIC_API_KEY

# Verify environment
barely doctor

# Initialize workspace and run your first test
barely init
barely run .barely/goals/example.md --url https://example.com --headless
```

## Commands

```
barely
├── init                           Scaffold a new .barely/ workspace
├── run <goal.md>                  Execute an AI-driven browser test
├── doctor                         Diagnose environment readiness
├── secret                         Zero-leak secret management
│   ├── set [KEY] [VALUE]            Store a secret (hidden prompt / piped stdin)
│   ├── get <KEY> [--show]           Inspect a secret (masked by default)
│   ├── list                         List all secrets with safe masking
│   └── unset <KEY>                  Remove a secret from .env
└── model                          AI model configuration
    ├── list                         List supported models + key readiness
    ├── get                          Show current default model
    └── set [MODEL]                  Change the default model
```

## `barely run`

```bash
barely run <goal.md> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--url` | Override the starting URL |
| `--context`, `-c` | Application context (credentials, test rules) |
| `--model`, `-m` | Override AI model for this run only |
| `--headless` | Run browser in headless mode |

### Pre-flight Guardrails

Before the browser launches, `barely run` validates:

1. **Goal file exists** — Clear error if file not found
2. **Headless auto-detection** — On Linux without `$DISPLAY`, auto-enables `--headless`
3. **API key validation** — Checks the required provider key for the selected model
4. **Playwright binary check** — Verifies Chromium is installed, prints OS-specific fix command

### Post-Run Integrations

After every test run, the CLI automatically dispatches:

| Integration | Trigger | Required Secrets |
|-------------|---------|------------------|
| PDF Report | Always | None (plugin) |
| Jira Bug | On failure | `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` |
| GitHub Issue | On failure | `GITHUB_TOKEN`, `GITHUB_REPO` |
| Slack Notification | Configurable | `SLACK_WEBHOOK_URL` |
| Teams Notification | Configurable | `TEAMS_WEBHOOK_URL` |

```
📄 PDF Report saved to: .barely/runs/run-1726750800/execution_report.pdf
🎫 Created Jira Bug: https://company.atlassian.net/browse/QA-142
🐙 Created GitHub Issue: https://github.com/org/repo/issues/28
📢 Dispatched incident notification to Slack.
📢 Dispatched incident notification to Microsoft Teams.
```

## `barely secret`

Secrets never leak into shell history. Three input modes:

```bash
# Hidden prompt (recommended)
barely secret set ANTHROPIC_API_KEY

# Piped from file
cat /path/to/token.txt | barely secret set ANTHROPIC_API_KEY

# Interactive menu (no arguments)
barely secret set
```

Inspect and manage:

```bash
barely secret list                        # Masked overview of all secrets
barely secret get ANTHROPIC_API_KEY       # Masked value
barely secret get ANTHROPIC_API_KEY -s    # Plaintext (explicit opt-in)
barely secret unset ANTHROPIC_API_KEY     # Remove from .env
```

## `barely model`

```bash
barely model list                         # List models + key readiness
barely model get                          # Show current default
barely model set anthropic/claude-sonnet-4-5  # Set default
barely model set                          # Interactive picker
```

Supported models:

| Model | Provider | Required Key |
|-------|----------|-------------|
| `anthropic/claude-sonnet-4-5` | Anthropic | `ANTHROPIC_API_KEY` |
| `anthropic/claude-3-7-sonnet` | Anthropic | `ANTHROPIC_API_KEY` |
| `openai/gpt-4o` | OpenAI | `OPENAI_API_KEY` |
| `openai/gpt-4o-mini` | OpenAI | `OPENAI_API_KEY` |
| `gemini/gemini-2.0-flash` | Google | `GEMINI_API_KEY` |
| `groq/llama-3.3-70b-versatile` | Groq | `GROQ_API_KEY` |

## `barely doctor`

Runs 5 environment health checks:

```
🩺 Barely Environment Diagnostics
==================================
  [✓] Python 3.12.0 (virtualenv active)
  [✓] macOS desktop environment detected
  [✓] Chromium browser installed (/path/to/chromium)
  [✓] AI Provider Keys:
      • Anthropic (ANTHROPIC_API_KEY): configured (sk-ant...3456)
  [✓] DATABASE_URL not configured (Standalone file/local mode active)
==================================
🎉 Ready! All core requirements are satisfied.
```

## OS Installers

| Script | Target |
|--------|--------|
| `install.sh` | Cross-platform auto-detect dispatcher |
| `scripts/install-ubuntu.sh` | Ubuntu / Debian |
| `scripts/install-rhel.sh` | RHEL / CentOS / Fedora / Amazon Linux |
| `scripts/install-mac.sh` | macOS (Homebrew) |
| `scripts/install-windows.ps1` | Windows (PowerShell) |

## License

MIT License. See [LICENSE](../../LICENSE) for details.
