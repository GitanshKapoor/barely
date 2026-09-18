# Ephemeral Pod Isolation & Parallel Test Execution in Kubernetes

Barely provides enterprise-grade, cloud-native test isolation by scheduling each individual automated test execution inside its own dedicated, single-use **Kubernetes Pod** (`batch/v1 Job`).

This architecture guarantees complete process isolation, eliminates container breakout risks via strict non-root enforcement, and enables linear horizontal scaling across multi-node Kubernetes clusters.

---

## 1. Architecture Overview

```
                           ┌──────────────────────────────────────────────┐
                           │   Barely Control Plane API                   │
                           │   (ServiceAccount: barely-job-spawner)       │
                           └──────────────────────┬───────────────────────┘
                                                  │
                       POST /apis/batch/v1/namespaces/barely/jobs
                                                  ▼
                     ┌──────────────────────────────────────────────────┐
                     │            Kubernetes Control Plane              │
                     └────────┬─────────────────────┬───────────────────┘
                              │                     │
                    Schedules Ephemeral Pod       Schedules Ephemeral Pod
                              │                     │
                              ▼                     ▼
          ┌───────────────────────────────┐ ┌───────────────────────────────┐
          │  Pod: barely-job-abc123       │ │  Pod: barely-job-def456       │
          │  (Test: Checkout Flow)        │ │  (Test: Login Authentication) │
          ├───────────────────────────────┤ ├───────────────────────────────┤
          │  UID: 10001 (USER barely)     │ │  UID: 10001 (USER barely)     │
          │  allowPrivilegeEscalation: 0  │ │  allowPrivilegeEscalation: 0  │
          │  capabilities: drop: [ALL]    │ │  capabilities: drop: [ALL]    │
          │  RAM Disk: /dev/shm (1Gi)     │ │  RAM Disk: /dev/shm (1Gi)     │
          │  Entrypoint: --single-run     │ │  Entrypoint: --single-run     │
          └───────────────┬───────────────┘ └───────────────┬───────────────┘
                          │                                 │
                          │ Auto-cleanup                    │ Auto-cleanup
                          ▼ (ttlAfterFinished: 180s)        ▼ (ttlAfterFinished: 180s)
                     [Terminated]                      [Terminated]
```

---

## 2. Security Hardening & Non-Root Context

Enterprise security teams strictly forbid running containers as `root` (`UID 0`) to prevent privilege escape and container breakouts. Barely enforces the CNCF **Pod Security Standards (PSS) Restricted Profile**:

### Container Image Level (`Dockerfile`)
- Defines dedicated system group and unprivileged user:
  ```dockerfile
  RUN groupadd -g 10001 barely && \
      useradd -u 10001 -g 10001 -m -s /bin/bash barely
  USER 10001
  ```
- File permissions on `/workspace`, `/opt/.venv`, and Playwright browser caches are strictly owned by `10001:10001`.

### Kubernetes Pod Security Context
Each ephemeral Job manifest enforces:
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  runAsGroup: 10001
  fsGroup: 10001
  seccompProfile:
    type: RuntimeDefault
```

### Container Security Context (Zero Privilege Escalation)
```yaml
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: false
  capabilities:
    drop:
      - ALL
```
- **No Sudo / Setuid**: Even if malicious code were injected into a test target, privilege escalation is prohibited by the Linux kernel.
- **Dropped Capabilities**: All 38+ Linux kernel capabilities (including `CAP_SYS_ADMIN`, `CAP_NET_ADMIN`, and `CAP_CHOWN`) are stripped.

---

## 3. Chromium Headless Memory Sandboxing (`/dev/shm`)

In standard non-root Linux containers, Chromium often fails with:
```
Bus error (core dumped)
```
This occurs because Docker and Kubernetes default to a tiny 64MB `/dev/shm` shared memory segment, insufficient for Chromium's multi-process IPC rendering and canvas buffers.

### Solution: In-Memory RAM Disk
Barely automatically mounts a dedicated in-memory `emptyDir` volume at `/dev/shm` with a 1Gi limit:
```yaml
volumeMounts:
  - name: dshm
    mountPath: /dev/shm

volumes:
  - name: dshm
    emptyDir:
      medium: Memory
      sizeLimit: 1Gi
```
This enables Chromium to run smoothly with zero crashes, without requiring `--no-sandbox` or root privileges.

---

## 4. Parallel Scheduling & Lifecycle Management

### Parallel Concurrency
Administrators can configure the maximum number of concurrent runner pods via the `/settings` UI or Helm `values.yaml`:
```yaml
execution:
  mode: k8s_job
  maxParallelPods: 10
```
- When multiple test runs are triggered simultaneously, each run immediately spawns its own isolated Pod on available cluster nodes.
- If concurrency exceeds `maxParallelPods`, surplus jobs remain safely queued in PostgreSQL (`status = 'pending'`) and are dispatched as earlier jobs finish.

### Automated Garbage Collection
Runner pods automatically self-terminate upon test completion. To avoid cluttering `kubectl get pods` or exhausting Kubernetes etcd capacity, Barely sets:
```yaml
spec:
  ttlSecondsAfterFinished: 180
  backoffLimit: 0
```
The Kubernetes Job controller automatically removes completed pods after 180 seconds.

---

## 5. Deployment & Configuration

### Step 1: Deploy Helm RBAC
Barely requires minimal in-cluster permissions to spawn and monitor runner jobs:
```bash
helm upgrade --install barely ./charts/barely \
  --namespace barely \
  --create-namespace \
  --set execution.mode=k8s_job \
  --set execution.maxParallelPods=10
```

The RBAC template (`charts/barely/templates/rbac-job-spawner.yaml`) grants:
- `batch/v1`: `jobs` (`create`, `get`, `list`, `watch`, `delete`)
- `core/v1`: `pods` & `pods/log` (`get`, `list`, `watch`, `delete`)

### Step 2: Configure via Web UI (`/settings`)
Navigate to **Settings** > **Execution Engine & Ephemeral Pod Isolation**:
1. Select **Kubernetes Isolated Pods (1 Ephemeral Pod per Test Run)**.
2. Adjust the **Max Parallel Isolated Pods** concurrency slider (1 to 20 pods).
3. Review the live cluster status indicator (shows in-cluster API server endpoint, namespace, and RBAC token state).
4. Click **Save Execution Settings**.

### Step 3: Per-Run Isolation Toggle
When creating a test run from the **New Run** modal:
- Toggle **🛡️ Run in Isolated Pod (Non-Root Sandbox)** to execute specifically inside an isolated Kubernetes Pod.
- If disabled, the run routes to the shared persistent worker pool.

---

## 6. Graceful Fallback for Local Development

When running Barely locally (e.g. via `docker-compose` outside of a Kubernetes cluster):
- `K8sJobSpawner` detects that `/var/run/secrets/kubernetes.io/serviceaccount` is absent.
- The platform automatically logs:
  ```
  [12:00:00] ℹ️ Running outside Kubernetes cluster. Executing run on persistent worker pool.
  ```
- The execution automatically and seamlessly falls back to the persistent daemon worker pool without error or manual intervention.
