# ==============================================================================
# Barely — ECS Services (private subnets, zero public IPs)
# ==============================================================================

resource "aws_ecs_service" "api" {
  name            = "${local.name_prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private_app[*].id
    security_groups  = [aws_security_group.ecs_api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "barely-api"
    container_port   = 8000
  }

  service_registries {
    registry_arn = aws_service_discovery_service.api.arn
  }

  health_check_grace_period_seconds = 60
  depends_on                        = [aws_lb_listener.http, aws_secretsmanager_secret_version.app_secrets]

  tags = { Name = "${local.name_prefix}-svc-api" }
}

resource "aws_ecs_service" "worker" {
  name            = "${local.name_prefix}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }

  network_configuration {
    subnets          = aws_subnet.private_app[*].id
    security_groups  = [aws_security_group.ecs_worker.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.worker.arn
  }

  tags = { Name = "${local.name_prefix}-svc-worker" }

  # The task definition references only the secret ARN, so nothing in the graph
  # forces the secret VALUE to exist first. Without this the service starts
  # pulling before the version is written and fails with
  # ResourceNotFoundException ... staging label: AWSCURRENT.
  depends_on = [aws_secretsmanager_secret_version.app_secrets]
}

resource "aws_ecs_service" "ui" {
  name            = "${local.name_prefix}-ui"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ui.arn
  desired_count   = var.ui_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private_app[*].id
    security_groups  = [aws_security_group.ecs_ui.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.ui.arn
    container_name   = "barely-ui"
    container_port   = 3000
  }

  health_check_grace_period_seconds = 60
  depends_on                        = [aws_lb_listener.http, aws_secretsmanager_secret_version.app_secrets]

  tags = { Name = "${local.name_prefix}-svc-ui" }
}
