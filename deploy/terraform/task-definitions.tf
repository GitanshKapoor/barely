# ==============================================================================
# Barely — ECS Task Definitions
# All secrets pulled from AWS Secrets Manager via valueFrom (zero plaintext).
# All containers run as non-root UID 10001.
# ==============================================================================

# --- API Task Definition (FastAPI Control Plane) ---

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "barely-api"
      image     = var.api_image
      essential = true
      user      = "10001:10001"

      portMappings = [{
        containerPort = 8000
        hostPort      = 8000
        protocol      = "tcp"
      }]

      environment = [
        { name = "ENVIRONMENT", value = var.environment },
        { name = "DEFAULT_MODEL", value = var.default_model },
        { name = "WORKER_ENDPOINT", value = "http://worker.${local.name_prefix}.internal:9090" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:DATABASE_URL::" },
        { name = "BARELY_SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:BARELY_SECRET_KEY::" },
        { name = "ANTHROPIC_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:ANTHROPIC_API_KEY::" },
        { name = "OPENAI_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:OPENAI_API_KEY::" },
        { name = "GEMINI_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:GEMINI_API_KEY::" },
        { name = "GROQ_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:GROQ_API_KEY::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }

      linuxParameters = { initProcessEnabled = true }
    }
  ])

  tags = { Name = "${local.name_prefix}-task-api" }
}

# --- Worker Task Definition (Playwright Browser Engine) ---

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name_prefix}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "barely-worker"
      image     = var.worker_image
      essential = true
      user      = "10001:10001"

      portMappings = [{
        containerPort = 9090
        hostPort      = 9090
        protocol      = "tcp"
      }]

      environment = [
        { name = "ENVIRONMENT", value = var.environment },
        { name = "HEADLESS", value = "true" },
        { name = "DEFAULT_MODEL", value = var.default_model },
        { name = "API_URL", value = "http://api.${local.name_prefix}.internal:8000" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:DATABASE_URL::" },
        { name = "BARELY_SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:BARELY_SECRET_KEY::" },
        { name = "ANTHROPIC_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:ANTHROPIC_API_KEY::" },
        { name = "OPENAI_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:OPENAI_API_KEY::" },
        { name = "GEMINI_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:GEMINI_API_KEY::" },
        { name = "GROQ_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:GROQ_API_KEY::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "worker"
        }
      }

      linuxParameters = {
        initProcessEnabled = true
      }
    }
  ])

  tags = { Name = "${local.name_prefix}-task-worker" }
}

# --- UI Task Definition (Next.js Dashboard) ---

resource "aws_ecs_task_definition" "ui" {
  family                   = "${local.name_prefix}-ui"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ui_cpu
  memory                   = var.ui_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "barely-ui"
      image     = var.ui_image
      essential = true
      user      = "10001:10001"

      portMappings = [{
        containerPort = 3000
        hostPort      = 3000
        protocol      = "tcp"
      }]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "INTERNAL_API_URL", value = "http://api.${local.name_prefix}.internal:8000" },
        { name = "NEXT_PUBLIC_API_URL", value = "/api" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ui"
        }
      }

      linuxParameters = { initProcessEnabled = true }
    }
  ])

  tags = { Name = "${local.name_prefix}-task-ui" }
}
