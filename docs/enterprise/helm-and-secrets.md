# Enterprise Secrets Management & Helm Integration

Barely provides two distinct modes for managing API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`) and sensitive credentials:

1. **Standalone / Self-Hosted Mode**: Credentials entered in the web UI are encrypted at rest with **AES-256 authenticated symmetric encryption** in PostgreSQL.
2. **Cloud-Native Enterprise Mode (Kubernetes & Helm)**: Credentials are synchronized from cloud vaults (**AWS Secrets Manager**, **Azure Key Vault**, **HashiCorp Vault**, **Google Cloud Secret Manager**) into Kubernetes via the **External Secrets Operator (ESO)** and mounted into Barely. In the UI, credentials are automatically detected, protected as **Read-Only**, and cannot be overwritten.

---

## Architecture Overview

```
 ┌────────────────────────────────────────────────────────┐
 │   Cloud Vaults (AWS SM, Azure KV, Vault, GCP SM)       │
 └──────────────────────────┬─────────────────────────────┘
                            │ (Syncs via IRSA / Workload Identity)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │       External Secrets Operator (ESO Controller)       │
 └──────────────────────────┬─────────────────────────────┘
                            │ (Generates Secret in Namespace)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │       Kubernetes Secret: "barely-secrets"              │
 └──────────────────────────┬─────────────────────────────┘
                            │ (Mounted via Helm values.yaml)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │       Barely Pod (/etc/secrets/barely/*)               │
 │                                                        │
 │  - Zero credentials hardcoded                          │
 │  - Keys marked as "Helm / K8s Secret (ESO)"            │
 │  - Inputs locked to Read-Only in UI to prevent drift   │
 │  - Live "Test Connection" button active                │
 └────────────────────────────────────────────────────────┘
```

---

## 1. AWS Secrets Manager Integration

### Step 1: Create Secret in AWS Secrets Manager
```bash
aws secretsmanager create-secret \
  --name barely/production \
  --description "Barely LLM Credentials" \
  --secret-string '{
    "ANTHROPIC_API_KEY": "sk-ant-api03-...",
    "OPENAI_API_KEY": "sk-proj-...",
    "GROQ_API_KEY": "gsk_..."
  }'
```

### Step 2: Configure External Secrets Operator (ESO)
Deploy the `ClusterSecretStore` using AWS IAM Roles for Service Accounts (IRSA):

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: barely-eso-sa
            namespace: default
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: barely/production
        property: ANTHROPIC_API_KEY
    - secretKey: OPENAI_API_KEY
      remoteRef:
        key: barely/production
        property: OPENAI_API_KEY
    - secretKey: GROQ_API_KEY
      remoteRef:
        key: barely/production
        property: GROQ_API_KEY
```

---

## 2. Azure Key Vault Integration

### Step 1: Create Secret in Azure Key Vault
```bash
az keyvault secret set \
  --vault-name "my-barely-vault" \
  --name "ANTHROPIC-API-KEY" \
  --value "sk-ant-api03-..."
```

### Step 2: Configure ESO with Azure Workload Identity
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: azure-key-vault
spec:
  provider:
    azurekv:
      authType: WorkloadIdentity
      vaultUrl: "https://my-barely-vault.vault.azure.net"
      serviceAccountRef:
        name: barely-eso-sa
        namespace: default
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-key-vault
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: ANTHROPIC-API-KEY
```

---

## 3. HashiCorp Vault Integration

### Step 1: Store Secret in Vault KV v2
```bash
vault kv put secret/barely/production \
  ANTHROPIC_API_KEY="sk-ant-api03-..." \
  OPENAI_API_KEY="sk-proj-..."
```

### Step 2: Configure ESO with Kubernetes Service Account Auth
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: hashicorp-vault
spec:
  provider:
    vault:
      server: "https://vault.internal:8200"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "barely-role"
          serviceAccountRef:
            name: barely-eso-sa
            namespace: default
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: hashicorp-vault
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  dataFrom:
    - extract:
        key: barely/production
```

---

## 4. Google Cloud Secret Manager Integration

### Step 1: Create Secret in GCP Secret Manager
```bash
echo -n "sk-ant-api03-..." | gcloud secrets create barely_anthropic_api_key \
  --data-file=- \
  --replication-policy="automatic"
```

### Step 2: Configure ESO with GKE Workload Identity
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: gcp-secret-manager
spec:
  provider:
    gcpsm:
      projectID: my-gcp-project
      auth:
        workloadIdentity:
          clusterLocation: us-central1
          clusterName: barely-cluster
          serviceAccountRef:
            name: barely-eso-sa
            namespace: default
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: gcp-secret-manager
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: barely_anthropic_api_key
```

---

## 5. Helm `values.yaml` Configuration

To connect the generated `barely-secrets` to the Barely application container, configure your Helm `values.yaml`:

```yaml
# values.yaml for Barely Helm Chart
secrets:
  # Mode: "helm" | "ui"
  # When set to "helm", UI secret inputs are automatically locked & disabled (GitOps Enforcement)
  mode: "helm"

  # Reference the secret generated by ESO or native Kubernetes Secret
  existingSecret: "barely-secrets"
  
  # Mounting as a filesystem volume enables zero-downtime hot-reloading without pod restarts
  mountPath: "/etc/secrets/barely"

# Non-sensitive platform defaults can be configured via native Kubernetes ConfigMap
config:
  existingConfigMap: "barely-config"

# The database connection itself is provided via secure Helm env / secret
database:
  existingSecret: "barely-db-secret"
  secretKey: "DATABASE_URL"
```

---

## 6. Native Kubernetes `Secret` & `ConfigMap` Support (Zero Operators)

If your team prefers pure, standard Kubernetes without External Secrets Operator:

```bash
# 1. Native Kubernetes Secret for sensitive API keys
kubectl create secret generic barely-secrets \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-api03-..." \
  --from-literal=OPENAI_API_KEY="sk-proj-..." \
  --from-literal=GROQ_API_KEY="gsk_..."

# 2. Native Kubernetes ConfigMap for non-sensitive defaults
kubectl create configmap barely-config \
  --from-literal=DEFAULT_MODEL="anthropic/claude-sonnet-4-5" \
  --from-literal=MAX_STEPS="25" \
  --from-literal=DEFAULT_DEVICE="desktop"
```

---

## 7. UI Security & Auto-Disable Behavior

When `secrets.mode: "helm"` is active:
* **Interactive Mode Switcher**: Displays whether the system is in **Web UI & Cloud Database** mode or **Helm & Kubernetes Secrets** mode.
* **Auto-Disabled Secret Inputs**: All secret fields (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) are grayed out with a lock icon 🔒 and marked **Read-Only** to prevent accidental drift.
* **API Level Enforcement**: The API rejects secret updates with `HTTP 403 Forbidden` if anyone attempts to edit via API when Helm mode is active.
* **Live Testing Active**: The **Test** button remains 100% active, allowing operators to run live 1-token pings against Anthropic, OpenAI, Groq, or Gemini to verify credentials directly from the web dashboard.

---

## 8. Master Encryption Key (`BARELY_SECRET_KEY` & `.barely_master.key`)

Barely encrypts all credentials at rest in PostgreSQL/SQLite using **AES-256 / Authenticated Keystream Cipher (Encrypt-then-MAC)**. The master key ensures that tokens saved in the database cannot be read in plaintext by database administrators or unauthorized processes.

### How Users Generate a Master Key

Generate a cryptographically secure 256-bit symmetric key using either OpenSSL or Python:

```bash
# Option 1: Using OpenSSL (Standard terminal on Linux/macOS)
openssl rand -hex 32

# Option 2: Using Python 3
python3 -c "import secrets; print(secrets.token_hex(32))"
```
*Example output*: `a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0`

### How to Configure Across Environments

| Environment | Configuration Location | Setup Example |
| :--- | :--- | :--- |
| 🐳 **Docker Compose** | Root `.env` file | `BARELY_SECRET_KEY=a1b2c3...` |
| ⎈ **Kubernetes (Helm)** | `barely-secrets` K8s Secret | `kubectl create secret generic barely-secrets -n barely --from-literal=barely_secret_key="$(openssl rand -hex 32)"` |
| ☁️ **AWS ECS (Terraform)**| AWS Secrets Manager | `"BARELY_SECRET_KEY": "a1b2c3..."` inside `${name_prefix}-secrets` |
| 🔄 **CI/CD Pipelines** | GitHub / GitLab Secrets | `BARELY_SECRET_KEY: ${{ secrets.BARELY_SECRET_KEY }}` |
| 💻 **Native CLI** | Auto-created `.barely_master.key` | Generated automatically by `barely run` with `chmod 0600` |

### Key Resolution Priority Hierarchy

When Barely starts, it searches for the master encryption key in this exact order:

1. **`BARELY_SECRET_KEY` (Environment Variable)**: Highest priority. Recommended for 12-factor apps, Docker Compose, Kubernetes, and ECS.
2. **`_INTERNAL_MASTER_KEY` (PostgreSQL Database Record)**: If no env var is passed, `barely-api` generates a key on first boot and commits it to the shared database. All worker pods and runners automatically share this key.
3. **`.barely_master.key` (Local Workspace File)**: Fallback for standalone local development when running without an external database. Ignored by `.gitignore` (`*.key`).

> **Tip**: If you have both `BARELY_SECRET_KEY` in `.env` and `.barely_master.key` in your workspace, you can safely delete `.barely_master.key`. Because `.env` takes Priority 1, Barely will always use the key from `.env`.
