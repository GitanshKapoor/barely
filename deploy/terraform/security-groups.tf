# ==============================================================================
# Barely Terraform Module - Tiered Least-Privilege Security Groups
# Implements strict 3-tier zero-trust isolation:
# Public Internet -> ALB -> Private UI & API -> Private RDS
# UI is 100% blocked from DB. Worker has 0 incoming ports.
# ==============================================================================

# --- 1. ALB Security Group ---
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-sg-alb"
  description = "Controls public inbound traffic to the Application Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    description = "Allow inbound HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow inbound HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound traffic from ALB to private target groups"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-sg-alb"
    Tier = "Public-Ingress"
  }
}

# --- 2. ECS UI Tasks Security Group ---
resource "aws_security_group" "ecs_ui" {
  name        = "${local.name_prefix}-sg-ecs-ui"
  description = "Controls traffic to and from the Next.js UI Fargate tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Allow inbound HTTP strictly from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Allow outbound to API and VPC NAT endpoints"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-sg-ecs-ui"
    Tier = "Private-Frontend"
  }
}

# --- 3. ECS API Tasks Security Group ---
resource "aws_security_group" "ecs_api" {
  name        = "${local.name_prefix}-sg-ecs-api"
  description = "Controls traffic to and from the FastAPI Control Plane tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Allow inbound HTTP strictly from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "Allow internal API requests strictly from UI tasks"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_ui.id]
  }

  egress {
    description = "Allow outbound to RDS, NAT Gateway (LLMs, Jira, Slack), and VPC endpoints"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-sg-ecs-api"
    Tier = "Private-ControlPlane"
  }
}

# --- 4. ECS Worker Tasks Security Group ---
resource "aws_security_group" "ecs_worker" {
  name        = "${local.name_prefix}-sg-ecs-worker"
  description = "Controls traffic for asynchronous test runners (0 inbound ports)"
  vpc_id      = var.vpc_id

  # Ingress is intentionally omitted: ZERO inbound traffic allowed

  egress {
    description = "Allow outbound to RDS, NAT Gateway (tested websites, LLMs), and VPC endpoints"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-sg-ecs-worker"
    Tier = "Private-Worker"
  }
}

# --- 5. RDS PostgreSQL Security Group ---
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-sg-rds"
  description = "Controls database traffic strictly to authorized application tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Allow PostgreSQL access strictly from API tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_api.id]
  }

  ingress {
    description     = "Allow PostgreSQL access strictly from Worker tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_worker.id]
  }

  # Egress is omitted: Database never initiates outbound connections

  tags = {
    Name = "${local.name_prefix}-sg-rds"
    Tier = "Private-Database"
  }
}
