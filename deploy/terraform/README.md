# Barely — AWS ECS Fargate Deployment

Deploy the complete Barely stack to AWS ECS Fargate with a single command. This module creates the **entire** infrastructure from scratch — VPC, subnets, NAT Gateway, RDS PostgreSQL, ECS Fargate cluster, ALB, Secrets Manager, Cloud Map DNS.

## Prerequisites

- [Terraform >= 1.5](https://developer.hashicorp.com/terraform/install)
- AWS CLI configured (`aws configure`)
- At least one AI provider API key (Anthropic, OpenAI, Gemini, or Groq)

## Quick Start

```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars — set ONLY these 2 values:
#   db_password       = "YourStrongPassword123!"
#   anthropic_api_key = "sk-ant-api03-..."

terraform init
terraform apply
```

**That's it.** Terraform creates ~30 AWS resources in ~8 minutes:

```
Apply complete! Resources: 30 added, 0 changed, 0 destroyed.

Outputs:
  dashboard_url    = "http://barely-production-alb-123456789.us-east-1.elb.amazonaws.com"
  api_docs_url     = "http://barely-production-alb-123456789.us-east-1.elb.amazonaws.com/docs"
  rds_endpoint     = "barely-production-db.abc123.us-east-1.rds.amazonaws.com"
  nat_gateway_ip   = "52.xx.xx.xx"
```

## What Gets Created

```
┌─────────────────────────────────────────────────────────────┐
│                        VPC (10.0.0.0/16)                    │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │  Public Subnet AZ-1  │  │  Public Subnet AZ-2  │        │
│  │  10.0.0.0/24         │  │  10.0.1.0/24         │        │
│  │  [ALB] [NAT Gateway] │  │  [ALB]               │        │
│  └──────────────────────┘  └──────────────────────┘        │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │  Private App AZ-1    │  │  Private App AZ-2    │        │
│  │  10.0.10.0/24        │  │  10.0.11.0/24        │        │
│  │  [API] [Worker] [UI] │  │  [API] [Worker] [UI] │        │
│  └──────────────────────┘  └──────────────────────┘        │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │  Private Data AZ-1   │  │  Private Data AZ-2   │        │
│  │  10.0.20.0/24        │  │  10.0.21.0/24        │        │
│  │  [RDS Primary]       │  │  [RDS Standby]       │        │
│  └──────────────────────┘  └──────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

| Resource | Details |
|----------|---------|
| **VPC** | `10.0.0.0/16`, DNS support enabled |
| **Subnets** | 6 subnets across 2 AZs (2 public, 2 private app, 2 private data) |
| **Internet Gateway** | Public subnet outbound |
| **NAT Gateway** | Private subnet outbound (ECR pulls, CloudWatch, LLM APIs) |
| **RDS PostgreSQL 16** | Private data subnets, encrypted, automated backups, Multi-AZ in production |
| **ECS Fargate Cluster** | Container Insights enabled, Fargate Spot for Workers |
| **3 ECS Services** | API (FastAPI), Worker (Playwright), UI (Next.js) |
| **ALB** | Path-based routing: `/api/*` → API, `/*` → UI |
| **Cloud Map** | Private DNS: `api.<project>.internal`, `worker.<project>.internal` |
| **Secrets Manager** | All secrets stored encrypted, referenced by ECS via `valueFrom` |
| **5 Security Groups** | Tiered zero-trust: ALB → UI → API → RDS, Worker has zero inbound |
| **IAM Roles** | Least-privilege execution + task roles |

## How Passwords & Secrets Work

**Zero plaintext secrets anywhere.**

1. You set `db_password` and `anthropic_api_key` in `terraform.tfvars` (git-ignored, never committed)
2. Terraform creates an AWS Secrets Manager secret containing all sensitive values as a JSON blob
3. ECS task definitions reference secrets via `valueFrom` — the ECS agent fetches them at container startup
4. Secrets **never** appear in:
   - ECS Console task definition view
   - CloudTrail API logs
   - Container environment variable dumps
   - Git history

```
terraform.tfvars (local only, git-ignored)
    ↓
AWS Secrets Manager (encrypted at rest with KMS)
    ↓
ECS Task Definition (references ARN, not value)
    ↓
Container runtime (injected as env var at startup)
```

The `BARELY_SECRET_KEY` (AES-256 encryption key) is auto-generated if you don't provide one.

## Configuration Reference

### Required (2 values)

| Variable | Description |
|----------|-------------|
| `db_password` | RDS PostgreSQL master password (min 8 characters) |
| `anthropic_api_key` | At least one AI provider key (or `openai_api_key`, `gemini_api_key`, `groq_api_key`) |

### Optional — Database Tier

| Variable | Default | Options |
|----------|---------|---------|
| `db_instance_class` | `db.t3.micro` | `db.t3.small`, `db.t3.medium`, `db.r6g.large` |
| `db_allocated_storage` | `20` GB | Any number |

### Optional — Container Sizing

| Variable | Default | Description |
|----------|---------|-------------|
| `api_cpu` / `api_memory` | `1024` / `2048` | 1 vCPU, 2 GB |
| `worker_cpu` / `worker_memory` | `2048` / `4096` | 2 vCPU, 4 GB (Chromium needs this) |
| `ui_cpu` / `ui_memory` | `512` / `1024` | 0.5 vCPU, 1 GB |
| `*_desired_count` | `1` | Number of task replicas |

### Optional — Container Images

| Variable | Default |
|----------|---------|
| `api_image` | `gitansh16k/ecs-barely-api:v1.6` |
| `worker_image` | `gitansh16k/ecs-barely-worker:v1.6` |
| `ui_image` | `gitansh16k/ecs-barely-ui:v1.6` |
| `cpu_architecture` | `X86_64` |

### Rebuilding the images

Fargate pulls the platform declared by `cpu_architecture`. Build with both flags below, or the task fails to start:

```bash
DH=gitansh16k; REPO=ecs-barely; TAG=v1.6
docker login -u $DH

docker build --platform linux/amd64 --provenance=false --sbom=false --target api    -t $DH/$REPO-api:$TAG .
docker build --platform linux/amd64 --provenance=false --sbom=false --target worker -t $DH/$REPO-worker:$TAG .
docker build --platform linux/amd64 --provenance=false --sbom=false -f Dockerfile.ui -t $DH/$REPO-ui:$TAG .

for i in api worker ui; do docker push $DH/$REPO-$i:$TAG; done
```

- **`--provenance=false --sbom=false`** — with Docker's containerd image store, `docker build` exports an OCI *manifest list* carrying provenance attestations. The attestation descriptor has platform `unknown/unknown`, which Fargate cannot resolve, failing the pull with `image Manifest does not contain descriptor matching platform 'linux/amd64'` **even when the image really is amd64**. These flags export a plain single-platform manifest.
- **`--platform linux/amd64`** — must match `cpu_architecture`. For arm64 Fargate, build `--platform linux/arm64` and set `cpu_architecture = "ARM64"`.

Verify before applying — one `linux/amd64` entry, no `unknown/unknown`:

```bash
docker buildx imagetools inspect $DH/$REPO-worker:$TAG
```

ECS caches by tag, so pushing over an existing tag will not redeploy. Bump `TAG` instead.

## Tear Down

```bash
terraform destroy
```

Destroys all 30 resources cleanly. RDS has `skip_final_snapshot = true` and `deletion_protection = false` for easy teardown.

## Estimated Monthly Cost

| Resource | Cost |
|----------|------|
| NAT Gateway | ~$32/mo |
| RDS db.t3.micro | Free tier / ~$15/mo |
| ECS Fargate (3 tasks) | ~$40-80/mo |
| ALB | ~$16/mo |
| **Total** | **~$100-140/mo** |

> Workers use **Fargate Spot** by default (up to 70% savings on compute).

## License

MIT License. See [LICENSE](../../LICENSE) for details.
