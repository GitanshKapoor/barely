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
