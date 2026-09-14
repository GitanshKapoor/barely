# Barely — Architecture Evolution

## Phase 0-2: The Modular Monolith (CLI-First)
Designed for velocity, local development, and easy CI/CD integration.

```mermaid
graph TD
    subgraph "Single Python Process (barely run)"
        CLI[CLI Entrypoint]
        Parser[Goal Parser]
        Agent[AI Agent Loop]
        Engine[Playwright Engine]
        Reporter[SQLite + HTML Reporter]
        
        CLI --> Parser
        Parser --> Agent
        Agent <-->|Read DOM / Send Clicks| Engine
        Agent --> Reporter
    end
    
    LLM((Groq/LLM API))
    Agent <-->|REST| LLM
```

## Phase 3-5: Enterprise Microservices
Designed for massive parallel execution and dashboard management.

```mermaid
graph TD
    subgraph "Control Plane (Microservice 1)"
        API[FastAPI Service]
        UI[Next.js Dashboard]
        DB[(PostgreSQL)]
        Queue[(Redis/Kafka Queue)]
        
        UI <--> API
        API <--> DB
        API -->|Push Jobs| Queue
    end

    subgraph "Data Plane / Execution (Microservice 2)"
        Worker1[Worker Pod 1]
        Worker2[Worker Pod 2]
        WorkerN[Worker Pod N]
        
        Queue -->|Pull Jobs| Worker1
        Queue -->|Pull Jobs| Worker2
        
        Worker1 -->|Upload Artifacts| S3[(AWS S3)]
    end
```

## Release 1.0 Production System & Control Flow

The complete end-to-end execution flow of Barely across the ingestion, control plane, autonomous worker, and deliverables pipelines:

```mermaid
flowchart TD
    subgraph Ingestion["1. Ingestion & Client Layer"]
        UI["Next.js 16 Dashboard\n(localhost:3000)"]
        CLI["CLI Runner\n(uv run barely run)"]
        CI["CI/CD Pipeline\n(GitHub Action / Webhook)"]
    end

    subgraph ControlPlane["2. Control Plane & State Persistence"]
        API["FastAPI Control Plane (:8000)\n(Job Dispatcher & Status Poller)"]
        PG[("PostgreSQL 15 Database\n- test_runs\n- action_plans ($0 Cache)\n- visual_baselines\n- run_artifacts")]
    end

    subgraph WorkerFleet["3. Autonomous Worker Engine (Playwright + AI)"]
        Parser["Goal Parser\n(checkout.md -> AST)"]
        Distiller["DOM Distiller Engine\n(ARIA filter, locator scoring)"]
        Cache{"$0 Action Plan\nCache Hit?"}
        LLM["Multi-LLM Reasoning Loop\n(Claude 3.5 Sonnet / Groq / OpenAI)"]
        Browser["Playwright Headless/Headful Driver\n(Strict Locators & Autonomous Healing)"]
        VRT["Autonomous VRT Engine\n(Desktop / Tablet / Mobile Baselines)"]
    end

    subgraph Deliverables["4. Auditable Deliverables"]
        PDF["Print-Ready PDF Audit Report"]
        ZIP["Compressed Run Bundle (.zip)\n(REPORT.md, report.html, logs)"]
        Timeline["Real-Time Console & DOM Timeline"]
    end

    UI <-->|REST API & Polling| API
    CLI -->|Dispatch / Run| API
    CI -->|Trigger API| API
    API <-->|SQLAlchemy Async Engine| PG

    API -->|Dispatch Goal| Parser
    Parser --> Distiller
    Distiller --> Cache
    Cache -->|Hit: $0 Cost, Instant Playback| Browser
    Cache -->|Miss: AI Exploration| LLM
    LLM -->|Deterministic Actions| Browser
    Browser -->|Save Action Plan| PG
    Browser -->|Capture Viewport Snapshots| VRT
    VRT -->|Store Golden Baselines & Diffs| PG
    Browser -->|Persist Logs & Telemetry| PG
    PG --> Deliverables
    PG --> Timeline
```
