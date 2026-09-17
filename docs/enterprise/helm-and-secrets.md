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
  # Reference the secret generated by External Secrets Operator
  existingSecret: "barely-secrets"
  
  # Mounting as a filesystem volume enables zero-downtime hot-reloading without pod restarts
  mountPath: "/etc/secrets/barely"

# The database connection itself is provided via secure Helm env / secret
database:
  existingSecret: "barely-db-secret"
  secretKey: "DATABASE_URL"
```

---

## 6. UI Security & Verification Behavior

When deployed with Helm and ESO:
* **Dynamic Header**: Displays `Enterprise Mode: Helm & Kubernetes Secrets (ESO)` with a cyan badge `⎈ Kubernetes Managed`.
* **Read-Only Inputs**: Keys injected via Kubernetes are badged `⎈ Helm / K8s Secret (ESO)` and locked from editing to prevent GitOps drift.
* **Live Testing**: The **Test** button remains active, allowing operators to run live 1-token test pings against Anthropic, OpenAI, Groq, or Gemini to verify provider authentication directly from the web dashboard.
