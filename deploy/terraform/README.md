# ☁️ Barely - AWS ECS Fargate Deployment via Terraform

Production Terraform module deploying **Barely** on **AWS ECS Fargate** with zero-trust networking, Application Load Balancer (ALB), and AWS Cloud Map private DNS.

---

## AWS Architecture Topology

```mermaid
flowchart TD
    subgraph Internet["Public Internet"]
        User["User / CI Pipeline"]
    end

    subgraph AWSVPC["AWS VPC (10.0.0.0/16)"]
        subgraph PublicSubnets["Public Subnets (AZ-a, AZ-b)"]
            ALB["Application Load Balancer (ALB)\nSecurity Group: sg-alb\nPorts: 80 (Redirect), 443 (HTTPS)"]
            NAT["NAT Gateways (AZ-a, AZ-b)\nOutbound Internet Access"]
        end

        subgraph PrivateAppSubnets["Private Application Subnets (AZ-a, AZ-b)"]
            subgraph CloudMap["AWS Cloud Map (Private DNS: barely.internal)"]
                API_DNS["api.barely.internal:8000"]
                UI_DNS["ui.barely.internal:3000"]
            end

            ECSUi["ECS Service: barely-ui\n(AWS Fargate)\nSecurity Group: sg-ecs-ui\nPort: 3000 | Non-Root UID 10001\nassign_public_ip: false"]
            ECSApi["ECS Service: barely-api\n(AWS Fargate)\nSecurity Group: sg-ecs-api\nPort: 8000 | Non-Root UID 10001\nassign_public_ip: false"]
            ECSWorker["ECS Service: barely-worker\n(AWS Fargate / Fargate Spot)\nSecurity Group: sg-ecs-worker\n0 Inbound Ports | Non-Root UID 10001\nassign_public_ip: false"]
        end

        subgraph PrivateDataSubnets["Private Database Subnets (AZ-a, AZ-b)"]
            RDS[("Amazon RDS PostgreSQL 16\nSecurity Group: sg-rds\nPort: 5432 (SSL Required)")]
        end

        subgraph AWSServices["Managed AWS Services"]
            SM["AWS Secrets Manager & KMS\n(API Keys & DB Credentials)"]
            CW["CloudWatch Log Group\n(/ecs/barely-prod)"]
        end
    end

    subgraph ExternalTargets["External SaaS & Tested Domains"]
        ExternalAPIs["OpenAI / Anthropic / Tested Domains"]
    end

    User -->|HTTPS :443| ALB
    ALB -->|Route /* :3000| ECSUi
    ALB -->|Route /api/* :8000| ECSApi
    ECSUi -->|Internal API :8000| ECSApi
    ECSApi -->|SQL :5432| RDS
    ECSWorker -->|SQL :5432| RDS
    ECSApi -.->|Task Execution Role| SM
    ECSWorker -.->|Task Execution Role| SM
    ECSApi -.-> CW
    ECSWorker -.-> CW
    ECSUi -.-> CW
    ECSApi -->|NAT Gateway :443| NAT
    ECSWorker -->|NAT Gateway :80, :443| NAT
    NAT -->|HTTPS :443| ExternalAPIs
```

---

## Security Groups Firewall Rules Matrix

| Security Group | Inbound Rules | Outbound Rules | Security Rationale |
| :--- | :--- | :--- | :--- |
| **`sg-alb`** (ALB) | • `0.0.0.0/0` on `80` (HTTP)<br>• `0.0.0.0/0` on `443` (HTTPS) | • `sg-ecs-ui` on `3000`<br>• `sg-ecs-api` on `8000` | Internet entry point. Terminates TLS and forwards strictly to private target groups. |
| **`sg-ecs-ui`** (UI) | • `sg-alb` on `3000` | • `sg-ecs-api` on `8000`<br>• `0.0.0.0/0` on `443` (VPC/NAT) | UI is inaccessible directly from the internet. Communicates only with API. **Zero access to RDS.** |
| **`sg-ecs-api`** (API) | • `sg-alb` on `8000`<br>• `sg-ecs-ui` on `8000` | • `sg-rds` on `5432`<br>• `0.0.0.0/0` on `443` (NAT Gateway) | API accepts traffic only from ALB and UI. Connects strictly to RDS and outbound integrations. |
| **`sg-ecs-worker`** (Worker) | **NONE (0 Inbound Rules)** | • `sg-rds` on `5432`<br>• `0.0.0.0/0` on `80, 443` (NAT Gateway) | Worker accepts zero incoming traffic. Initiates outbound connections for browser testing. |
| **`sg-rds`** (RDS) | • `sg-ecs-api` on `5432`<br>• `sg-ecs-worker` on `5432` | **NONE (0 Outbound Rules)** | Database is completely private. Accessible only by authorized application tasks. |

---

## Prerequisites
- **Terraform** >= 1.5.0 installed
- **AWS CLI v2** configured with administrator credentials
- Existing AWS VPC with public and private subnets across at least 2 Availability Zones
- AWS ECR repositories for container images

---

## Deployment Walkthrough

### Step 1: Push Container Images to ECR
```bash
# Authenticate Docker to your AWS ECR registry
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build & push API
docker build -t 123456789012.dkr.ecr.us-east-1.amazonaws.com/barely-api:1.0.0 --target api .
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/barely-api:1.0.0

# Build & push UI
docker build -t 123456789012.dkr.ecr.us-east-1.amazonaws.com/barely-ui:1.0.0 -f Dockerfile.ui .
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/barely-ui:1.0.0

# Build & push Worker
docker build -t 123456789012.dkr.ecr.us-east-1.amazonaws.com/barely-worker:1.0.0 --target worker .
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/barely-worker:1.0.0
```

### Step 2: Configure Terraform Variables
```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars
```
Edit `terraform.tfvars` with your specific VPC IDs, subnets, ACM certificate ARN, and ECR image tags:
```hcl
aws_region          = "us-east-1"
environment         = "prod"
app_name            = "barely"
vpc_id              = "vpc-0123456789abcdef0"
public_subnet_ids   = ["subnet-01111111111111111", "subnet-02222222222222222"]
private_app_subnet_ids = ["subnet-03333333333333333", "subnet-04444444444444444"]
private_data_subnet_ids = ["subnet-05555555555555555", "subnet-06666666666666666"]
acm_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
api_image           = "123456789012.dkr.ecr.us-east-1.amazonaws.com/barely-api:1.0.0"
ui_image            = "123456789012.dkr.ecr.us-east-1.amazonaws.com/barely-ui:1.0.0"
worker_image        = "123456789012.dkr.ecr.us-east-1.amazonaws.com/barely-worker:1.0.0"
```

### Step 3: Initialize & Deploy
```bash
# Initialize Terraform and download provider plugins
terraform init

# Review execution plan
terraform plan

# Apply infrastructure changes
terraform apply
```

### Step 4: Populate AWS Secrets Manager
After Terraform provisions the secret container (`barely-prod-secrets`), populate it with your actual credentials:
```bash
aws secretsmanager put-secret-value \
  --secret-id barely-prod-secrets \
  --secret-string '{
    "DATABASE_URL": "postgresql://barely_user:password@rds.endpoint:5432/barelydb?sslmode=require",
    "ANTHROPIC_API_KEY": "sk-ant-api03-...",
    "OPENAI_API_KEY": "sk-proj-...",
    "JIRA_API_TOKEN": "your_token",
    "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/..."
  }'
```

### Step 5: Force ECS Deployment to Pick Up Secrets
```bash
aws ecs update-service --cluster barely-prod-cluster --service barely-prod-api --force-new-deployment
aws ecs update-service --cluster barely-prod-cluster --service barely-prod-worker --force-new-deployment
```

---

## Operational Verification

### Check ALB Target Health
```bash
aws elbv2 describe-target-health \
  --target-group-arn $(terraform output -raw alb_dns_name)
```

### Stream CloudWatch Logs
```bash
# Stream API logs in real-time
aws logs tail /ecs/barely-prod --follow --filter-pattern "api"

# Stream Worker test logs
aws logs tail /ecs/barely-prod --follow --filter-pattern "worker"
```

---

## Teardown
```bash
terraform destroy
```
