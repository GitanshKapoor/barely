# 🏛️ Barely — System Architecture & Cloud Engineering Guide

Barely is an enterprise-grade autonomous visual AI end-to-end testing platform. It translates natural language test goals and intent into deterministic Playwright browser actions, maintains visual baselines, automatically heals fragile locators, and syncs regression defects directly into issue tracking and incident management tools.

This document details the architectural evolution, microservices topology, cloud execution primitives, zero-trust security model, and data flow of Barely **Release 2.0 "Boss Penguin"** and beyond.

---

## 1. Architectural Evolution

```mermaid
flowchart LR
    subgraph Phase0["Phase 0-1: CLI Prototype"]
        P0_CLI["Standalone Python CLI"] --> P0_PW["Local Playwright"]
        P0_PW --> P0_FS["Local SQLite & Files"]
    end

    subgraph Phase2["Release 2.0: Cloud-Native Microservices"]
        P2_UI["Next.js 16 UI"] <--> P2_API["FastAPI Control Plane"]
        P2_API <--> P2_DB[("PostgreSQL 16\nCloud Database")]
        P2_API --> P2_RUN["K8s Runner Pods\nAWS ECS Tasks"]
        P2_RUN --> P2_EXT["SaaS Integrations\nJira / Slack / Teams"]
    end

    subgraph Phase3["Release 3.0: Distributed Fleet"]
        P3_ORCH["Multi-Agent Orchestrator"] --> P3_FLEET["Clustered Fleet\nWork-Stealing Shards"]
        P3_ORCH --> P3_IAM["Enterprise IAM\nWorkspaces & Folders"]
    end

    Phase0 --> Phase2 --> Phase3
```

- **Phase 0–1 (Modular Monolith CLI)**: Single-process runner using SQLite and local HTML reporting for local developers.
- **Release 2.0 "Boss Penguin" (Cloud-Native Microservices)**: Decoupled FastAPI control plane, Next.js 16 dashboard, external PostgreSQL 16 persistence, ephemeral Kubernetes runner pods (`UID 10001`), AWS ECS Terraform modules, automated Jira/GitHub defect filing, and Slack/Teams incident alerts.
- **Release 3.0 (Distributed Multi-Agent Fleet)**: Clustered runner orchestration with intra-suite dynamic sharding, work-stealing, collaborative multi-agent testing, enterprise RBAC/IAM, and batched notification rollups.

---

## 2. End-to-End System Architecture & Control Flow

The production execution lifecycle of Barely across client ingestion, control plane, autonomous worker reasoning, and deliverable pipelines:

```mermaid
flowchart TD
    subgraph Layer1["1. Ingestion & Client Layer"]
        UI["Next.js 16 UI Dashboard\n(localhost:3000)\nReact 19 • SWR Caching"]
        CLI["Native CLI Runner\n(uv run barely run)\nLocal Developer Terminal"]
        CI["CI/CD Automation\n(GitHub Actions / GitLab CI)\nPR Merge Gating"]
    end

    subgraph Layer2["2. Control Plane & State Persistence"]
        API["FastAPI Control Plane (:8000)\nAsync Job Dispatcher & Status Poller\nAES-256 Fernet Secret Encryption"]
        CloudDB[("PostgreSQL 16 Database\n(Amazon RDS / Cloud SQL / Neon / Local)\n- test_runs & live logs\n- action_plans ($0 Cache)\n- visual_baselines & diffs\n- run_artifacts & deliverables")]
        Secrets["Enterprise Secrets Management\n(CNCF ESO / AWS Secrets Manager / Vault)"]
    end

    subgraph Layer3["3. Autonomous Worker Engine (Playwright + AI)"]
        Parser["Goal Parser\nMarkdown Frontmatter to AST"]
        Distiller["DOM Distiller Engine\nARIA Tree Pruning & Unique ID Injection"]
        CacheCheck{"Action Plan\nCache Hit?"}
        LLM["LiteLLM Multi-Modal Reasoning Loop\nAnthropic Claude • OpenAI GPT • Google Gemini • Groq"]
        Runner["Playwright Browser Automation\nEphemeral K8s Runner Pods / ECS Tasks\nNon-Root UID 10001 • 1GB /dev/shm"]
        VRT["Autonomous VRT Engine\nViewport Snapshots across Desktop, Tablet, Mobile"]
    end

    subgraph Layer4["4. Deliverables & Incident Alerting Pipeline"]
        PDF["Executive Audit PDF Reports\nMulti-page print-ready documentation"]
        ZIP["Run Artifact Bundles (.zip)\nStep screenshots, video traces, console logs"]
        Jira["Atlassian Jira Defect Sync\nADF markdown formatting, stack traces, screenshots"]
        GitHub["GitHub Issues Sync\nAutomated issue filing with regression labels"]
        Slack["Slack Webhooks\nInteractive Block Kit failure cards"]
        Teams["Microsoft Teams Webhooks\nAdaptive Cards with deep links"]
    end

    UI <-->|REST API & Polling| API
    CLI -->|Dispatch Goal| API
    CI -->|Trigger Test Run| API
    API <-->|SQLAlchemy 2.0 Async Engine| CloudDB
    Secrets -.->|ExternalSecret Sync| API

    API -->|Dispatch Test Run| Parser
    Parser --> Distiller
    Distiller --> CacheCheck
    CacheCheck -->|Cache Hit: $0 Cost & Sub-Second| Runner
    CacheCheck -->|Cache Miss: Vision Grounding| LLM
    LLM -->|Deterministic Actions| Runner
    Runner -->|Save Cached Action Plan| CloudDB
    Runner -->|Viewport Snapshots| VRT
    VRT -->|Store Golden Baselines & Diffs| CloudDB
    Runner -->|Persist Steps & Video Traces| CloudDB

    API -->|Generate PDF Report| PDF
    API -->|Package Bundle| ZIP
    API -->|File Failure Ticket| Jira
    API -->|Open Bug Issue| GitHub
    API -->|Send Incident Card| Slack
    API -->|Send Incident Card| Teams
```

---

## 3. Database Architecture: Stateless Workloads vs. Managed Cloud Storage

A foundational principle of Barely's production architecture is **100% Stateless Application Workloads**.

```mermaid
flowchart TD
    subgraph K8s["Kubernetes Cluster / ECS Tasks (100% Stateless Workloads)"]
        UI_Pod["barely-ui\n(Port 3000)"]
        API_Pod["barely-api\n(Port 8000)"]
        Worker_Pod["barely-worker\n(Ephemeral Job Pods)"]
    end

    subgraph Storage["Persistence Layer (Decoupled & Managed)"]
        RDS[("Amazon RDS / Cloud SQL PostgreSQL 16\nMulti-AZ High Availability\nAutomated Point-in-Time Recovery\nSSL Enforced: sslmode=require")]
        DevDB[("Optional Local barely-db Container\n(Docker Compose / Minikube StatefulSet)\nOffline Testing & Local Dev Only")]
    end

    UI_Pod -->|Internal API :8000| API_Pod
    API_Pod -->|PostgreSQL :5432| RDS
    Worker_Pod -->|PostgreSQL :5432| RDS
    API_Pod -.->|Optional Dev Fallback| DevDB
    Worker_Pod -.->|Optional Dev Fallback| DevDB
```

### When is PostgreSQL a Container/Pod?
- **Local Development (`docker compose up -d`)**:
  Spins up `barely-db` using `postgres:16-alpine` on an isolated Docker bridge network (`barely_backend`). No host ports are exposed (`expose: ["5432"]`), allowing instant local evaluation without AWS accounts.
- **Offline / Air-Gapped Kubernetes (Minikube / Kind / Datacenters)**:
  For local testing without cloud access, setting `database.inCluster.enabled=true` in Helm provisions `barely-postgresql-0` as a local StatefulSet with a 10Gi PersistentVolumeClaim.

### When is PostgreSQL Cloud-Managed? (Production EKS / GKE / AKS & ECS)
In cloud production, running stateful relational databases inside Kubernetes pods is an operational anti-pattern:
- **Pod Eviction & Node Preemption**: When Kubernetes nodes restart or run out of memory, stateful database pods are killed and rescheduled. Persistent Volume Claims (PVCs) can experience mounting locks, taking minutes to recover.
- **Managed Reliability**: Managed cloud databases (Amazon RDS PostgreSQL 16, Google Cloud SQL, Neon, Supabase) deliver automated Multi-AZ failover (< 30 seconds), point-in-time recovery, automated backups, and zero downtime maintenance.
- **Infinite Stateless Scaling**: Because the database is external, every pod inside the Kubernetes cluster (`barely-ui`, `barely-api`, `barely-worker`) is **100% stateless**. Workloads can autoscale from 2 to 50+ parallel runner pods via HPA without any risk of database volume corruption.

---

## 4. Multi-Modal AI Reasoning & Action Caching Engine

Barely eliminates the brittleness of traditional CSS/XPath locators by combining **DOM distillation** with **multi-modal vision reasoning** and **deterministic plan caching**:

```mermaid
sequenceDiagram
    autonumber
    participant User as User / CI
    participant Control as FastAPI Control Plane
    participant DB as PostgreSQL 16
    participant Distiller as DOM Distiller
    participant LLM as LiteLLM Reasoning Hub
    participant Browser as Playwright Browser

    User->>Control: Submit Test Goal (e.g. "Checkout Laptop")
    Control->>DB: Check Action Plan Cache for target URL & Goal
    alt Cache Hit: $0 Cost & Instant Playback
        DB-->>Control: Return Cached Deterministic Actions
        Control->>Browser: Execute exact step sequence (0ms AI latency)
    else Cache Miss: Autonomous AI Exploration
        Control->>Browser: Navigate to Target URL
        loop Until Goal Completion or Assertion Failure
            Browser->>Distiller: Extract live DOM snapshot
            Distiller->>Distiller: Prune hidden elements, score ARIA roles, inject [barely-id]
            Distiller->>LLM: Send Distilled DOM, Instructions, and Viewport Snapshot
            LLM-->>Browser: Emit Structured Action (click, fill, select, assert)
            Browser->>Browser: Execute Playwright action with auto-healing
            Browser->>DB: Record step telemetry & capture visual snapshot
        end
        Browser->>DB: Save verified Action Plan to Cache for future runs
    end
    Control->>User: Return Execution Audit Report & Status
```

### Action Plan Caching ($0 Cost Regressions)
- On the initial run of a test goal, the AI agent explores the DOM, validates locators, and executes steps.
- Upon passing, Barely compiles the exact deterministic sequence into an **Action Plan** stored in PostgreSQL.
- Subsequent regression runs bypass LLM API calls entirely: tests execute in milliseconds via pure Playwright at **$0 cost**.
- If a web UI changes and a cached action fails, Barely automatically triggers **Autonomous Fallback Healing**, re-engaging the AI loop to discover updated selectors and re-cache the new path.

---

## 5. Enterprise Cloud Deployments & Security Hardening

Barely is engineered to comply with enterprise cloud security standards across container runtimes and orchestration platforms:

### 1. Restricted Pod Security Standards (UID 10001)
Every container (API, Worker, UI) runs as an unprivileged non-root user:
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  runAsGroup: 10001
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
  seccompProfile:
    type: RuntimeDefault
```

### 2. Chromium Shared Memory Protection (`/dev/shm 1Gi`)
Browser engines execute intensive multi-tab layout rendering. Without dedicated shared memory, Docker containers frequently crash with `SIGSEGV` or `Target closed`. Barely provisions 1GB dedicated `/dev/shm` across Docker Compose, Kubernetes Helm, and AWS ECS task definitions.

### 3. Zero-Leak Secrets Management
- **AES-256 Fernet Encryption**: Sensitive tokens (API keys, Jira tokens, Slack webhooks) are encrypted dynamically in PostgreSQL.
- **Zero-Leak Masking**: Keys are sanitized and masked in all API responses and UI components (`sk-ant-***`).
- **CNCF External Secrets Operator (ESO)**: Native support for synchronizing secrets directly from AWS Secrets Manager or HashiCorp Vault into Kubernetes pods without plain-text storage in Helm values.

---

## 6. Automated Issue Tracking & Notification Architecture

When a test run finishes or encounters visual/functional regressions, Barely automatically dispatches incident telemetry:

| Integration | Protocol | Payload Type | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Atlassian Jira** | REST API v3 | Atlassian Document Format (ADF) | Auto-creates bug tickets with reproduction steps, error logs, and failure screenshot attachments. |
| **GitHub Issues** | REST API v3 | GitHub Flavored Markdown | Automatically files defects with configurable labels (`bug`, `regression`), system specs, and run deep links. |
| **Slack** | Incoming Webhooks | Block Kit JSON | Contextual alert cards featuring test status badges, target URL, failure details, and direct links to Jira/GitHub. |
| **Microsoft Teams**| Incoming Webhooks | Adaptive Cards JSON | Rich interactive cards with status indicator dots, metadata tables, and action buttons. |

> **Standalone Guarantee**: When integrations are unconfigured or toggled off, Barely operates with **0 external HTTP requests** and **0ms latency penalty**.

---

## 7. Release 3.0 Architectural Evolution (Roadmap)

Barely's next major release transitions the platform from single-suite execution to **distributed multi-agent fleet orchestration**:

1. **Multi-Agent Fleet Orchestrator**:
   - Dynamic intra-suite sharding: An orchestrator leader agent dynamically partitions large suites (100+ tests) across clustered runner pods with intelligent work-stealing.
   - Multi-agent collaborative workflows: Simultaneous distinct agents executing inside the same session (e.g. Agent 1 acting as Buyer and Agent 2 acting as Seller in real-time).
2. **AI Execution Guardrails & Safety Policies**:
   - Autonomous boundary policies, target domain whitelisting, strict request rate limiting, and prompt injection filters protecting live web automation.
3. **Enterprise IAM, Workspaces & Test Folders**:
   - Multi-tenant role-based access control (RBAC), SSO/SAML auth, isolated team workspaces, and nested folder-based test suite organization.
4. **Smart Batched Notification Engine**:
   - Context-aware alert aggregation: individual test runs notify immediately, while test folder and suite runs automatically batch results into unified rollup summaries with multi-test status cards.
