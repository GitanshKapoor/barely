# ==============================================================================
# Barely — Tiered Security Groups (Zero-Trust)
# Internet -> ALB -> UI/API -> RDS
# Worker has ZERO inbound ports. UI is blocked from DB.
# ==============================================================================

# --- ALB Security Group (public-facing) ---

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-sg-alb"
  description = "ALB - allows HTTP/HTTPS from internet"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-sg-alb" }
}

# --- ECS UI Security Group ---

resource "aws_security_group" "ecs_ui" {
  name        = "${local.name_prefix}-sg-ecs-ui"
  description = "UI tasks - inbound only from ALB on 3000"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-sg-ecs-ui" }
}

# --- ECS API Security Group ---

resource "aws_security_group" "ecs_api" {
  name        = "${local.name_prefix}-sg-ecs-api"
  description = "API tasks - inbound from ALB and UI on 8000"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "Internal from UI"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_ui.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-sg-ecs-api" }
}

# --- ECS Worker Security Group (ZERO inbound) ---

resource "aws_security_group" "ecs_worker" {
  name        = "${local.name_prefix}-sg-ecs-worker"
  description = "Worker tasks - zero inbound, outbound to RDS/NAT/LLM APIs"
  vpc_id      = aws_vpc.main.id

  # Intentionally no ingress rules — workers pull work, never accept connections

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-sg-ecs-worker" }
}

# --- RDS Security Group ---

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-sg-rds"
  description = "RDS - PostgreSQL access only from API and Worker tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from API"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_api.id]
  }

  ingress {
    description     = "PostgreSQL from Worker"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_worker.id]
  }

  # RDS never initiates outbound — no egress needed

  tags = { Name = "${local.name_prefix}-sg-rds" }
}
