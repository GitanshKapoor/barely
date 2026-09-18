# ⎈ Barely - Enterprise Kubernetes Helm Chart

Production-grade Helm chart for **Barely**, an autonomous visual AI testing platform.

---

## Cluster Architecture

```mermaid
flowchart TD
    subgraph Internet["Public Internet"]
        Client["Browser Client / QA Team / CI/CD"]
    end

    subgraph CloudInfra["Cloud Infrastructure"]
        LBSvc["Cloud LoadBalancer Service (NLB / ALB / MetalLB)\nPorts: 80, 443"]
    end

    subgraph K8sCluster["Kubernetes Cluster (Namespace: barely)"]
        subgraph IngressNs["Ingress Controller (namespace: ingress-nginx)"]
            Nginx["NGINX Ingress Controller\n(ingressClassName: nginx)\nTLS Termination & Path Routing"]
        end

        subgraph CoreWorkloads["Workload Pods (Non-Root UID 10001)"]
            UI["barely-ui (Next.js Standalone)\nPort: 3000\nReplicas: 2+ (HPA)"]
            API["barely-api (FastAPI Control Plane)\nPort: 8000\nReplicas: 2+ (HPA)"]
            Worker["barely-worker / Ephemeral Runner Jobs\n(Playwright + Chromium Browser Pods)\nshm: 1Gi | Capabilities: Drop ALL"]
        end

        subgraph ClusterServices["Cluster Core Services"]
            CoreDNS["CoreDNS (kube-system)\nPort: 53 (UDP/TCP)"]
            K8sAPI["Kubernetes API Server\nPort: 443 / 6443"]
        end
    end

    subgraph CloudData["Managed Cloud Services (Recommended)"]
        RDS[("Amazon RDS / Cloud SQL PostgreSQL\nPort: 5432 (SSL Encrypted)")]
        Vault["AWS Secrets Manager / Vault\n(Synchronized via CNCF ESO)"]
    end

    subgraph ExternalTargets["External SaaS & Tested Domains"]
        LLM["LLM APIs (OpenAI / Anthropic / Gemini)\nPort: 443"]
        Integrations["Jira / Slack / Teams Webhooks\nPort: 443"]
        TestSites["Target Websites Under Test\nPorts: 80, 443"]
    end

    Client -->|HTTPS :443| LBSvc
    LBSvc --> Nginx
    Nginx -->|Path: /*| UI
    Nginx -->|Path: /api/*| API
    UI -->|Internal API :8000| API
    API -->|SQL :5432| RDS
    API -->|Spawn Ephemeral Jobs| K8sAPI
    API -->|Prompt Tokens :443| LLM
    API -->|Issue Sync :443| Integrations
    Worker -->|Sync Artifacts :5432| RDS
    Worker -->|DOM Analysis :443| LLM
    Worker -->|Playwright Actions :80, :443| TestSites
    Vault -.->|ExternalSecret Sync| API
    Vault -.->|ExternalSecret Sync| Worker
    UI -.->|DNS :53| CoreDNS
    API -.->|DNS :53| CoreDNS
    Worker -.->|DNS :53| CoreDNS
```

---

## Zero-Trust Network Policy Matrix (`netpol`)

By default, `networkPolicy.enabled: true` creates a baseline **Default-Deny** policy dropping all untracked ingress and egress. Traffic is permitted exclusively via explicit micro-segmentation rules:

| Pod Selector | Direction | Allowed Source / Destination | Ports | Security Guarantee |
| :--- | :--- | :--- | :--- | :--- |
| **All Pods (`{}`)** | **Default Deny** | None | All | Drops any untracked inter-pod or external connection. |
| **`barely-ui`** | Ingress | NGINX Ingress Controller | `TCP: 3000` | UI receives traffic solely from Ingress. |
| | Egress | `barely-api` Pods | `TCP: 8000` | UI calls backend API. |
| | Egress | CoreDNS (`kube-system`) | `UDP/TCP: 53` | DNS resolution. |
| | **Egress** | **Database (`barely-db`)** | **None** | **UI is 100% physically blocked from database.** |
| **`barely-api`** | Ingress | Ingress & `barely-ui` Pods | `TCP: 8000` | Handles UI and client API requests. |
| | Egress | PostgreSQL (`barely-db` or RDS) | `TCP: 5432` | Database persistence. |
| | Egress | Kubernetes API Server | `TCP: 443, 6443` | Spawns and streams logs from runner pods. |
| | Egress | CoreDNS (`kube-system`) | `UDP/TCP: 53` | DNS resolution. |
| | Egress | Internet (`0.0.0.0/0`) | `TCP: 443` | HTTPS calls to OpenAI, Anthropic, Jira, Slack. |
| **`barely-worker`** | **Ingress** | **NONE (Default Deny)** | None | **Zero incoming traffic permitted.** |
| | Egress | PostgreSQL (`barely-db` or RDS) | `TCP: 5432` | Saves run results and video traces. |
| | Egress | CoreDNS (`kube-system`) | `UDP/TCP: 53` | Resolves target domains. |
| | Egress | Internet (`0.0.0.0/0`) | `TCP: 80, 443` | Browses tested websites & reaches LLM APIs. |
| **`barely-db`** | Ingress | `barely-api` & `barely-worker` | `TCP: 5432` | Accepts queries only from authorized workloads. |
| | Egress | None | None | Database never initiates outbound connections. |

---

## Prerequisites
- Kubernetes cluster v1.26+
- Helm v3.10+
- **NGINX Ingress Controller** deployed (e.g. `ingress-nginx`)
- A managed PostgreSQL database (AWS RDS, Supabase, Neon) or enable in-cluster test DB

---

## Production Installation (Recommended: Cloud DB)

### 1. Create Namespace with Pod Security Standards
```bash
kubectl create namespace barely
kubectl label --overwrite namespace barely \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/enforce-version=latest
```

### 2. Create Database Secret
```bash
kubectl create secret generic barely-db-secret \
  --namespace barely \
  --from-literal=url="postgresql://barely_user:strong_password@rds-instance.xyz.us-east-1.rds.amazonaws.com:5432/barelydb?sslmode=require"
```

### 3. Create Application Secrets (AI Keys & Integrations)
```bash
kubectl create secret generic barely-secrets \
  --namespace barely \
  --from-literal=anthropic_api_key="sk-ant-api03-..." \
  --from-literal=openai_api_key="sk-proj-..." \
  --from-literal=jira_api_token="your_token" \
  --from-literal=slack_webhook_url="https://hooks.slack.com/services/..."
```
*(Alternatively, enable `externalSecrets.enabled: true` to synchronize automatically from AWS Secrets Manager or HashiCorp Vault).*

### 4. Create Production `values-prod.yaml`
```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: barely.yourcompany.com
      paths:
        - path: /api
          pathType: Prefix
          service: api
        - path: /
          pathType: Prefix
          service: ui
  tls:
    - secretName: barely-tls-cert
      hosts:
        - barely.yourcompany.com

api:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 15

ui:
  replicaCount: 2
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 8

networkPolicy:
  enabled: true
  ingressNamespace: "ingress-nginx"
```

### 5. Deploy with Helm
```bash
helm install barely ./charts/barely \
  --namespace barely \
  -f charts/barely/values.yaml \
  -f values-prod.yaml
```

---

## Testing / Local Installation (In-Cluster Database)

For test clusters, Minikube, or kind where an external Cloud DB is not available:

```bash
helm install barely ./charts/barely \
  --namespace barely \
  --set database.type=inCluster \
  --set database.inCluster.enabled=true \
  --set database.inCluster.persistence.enabled=true \
  --set database.inCluster.persistence.size=10Gi
```

---

## Verifying the Deployment

### 1. Check Pod Status & Health Probes
```bash
kubectl get pods -n barely
```
Output:
```
NAME                              READY   STATUS    RESTARTS   AGE
barely-api-7b89f5d679-4x4ql       1/1     Running   0          2m
barely-api-7b89f5d679-8dfl2       1/1     Running   0          2m
barely-ui-6f7564d78b-m8zqp        1/1     Running   0          2m
barely-ui-6f7564d78b-v9wlx        1/1     Running   0          2m
```

### 2. Verify Active Network Policies
```bash
kubectl get netpol -n barely
```
Output:
```
NAME                           POD-SELECTOR                                AGE
barely-default-deny-all        <none>                                      2m
barely-ui-netpol               app.kubernetes.io/name=barely-ui            2m
barely-api-netpol              app.kubernetes.io/name=barely-api           2m
barely-worker-netpol           app.kubernetes.io/component=runner          2m
```

### 3. Verify Ingress & TLS
```bash
kubectl get ingress -n barely
```

---

## Upgrades, Rollbacks & Uninstall

```bash
# Upgrade release with zero downtime
helm upgrade barely ./charts/barely -n barely -f values-prod.yaml

# Rollback to previous release
helm rollback barely 1 -n barely

# Uninstall release
helm uninstall barely -n barely
```
