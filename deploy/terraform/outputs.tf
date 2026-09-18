# ==============================================================================
# Barely Terraform Module - Outputs
# ==============================================================================

output "alb_dns_name" {
  description = "Public DNS hostname of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Route 53 canonical hosted zone ID for the ALB"
  value       = aws_lb.main.zone_id
}

output "ecs_cluster_name" {
  description = "Name of the provisioned ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "cloudmap_namespace" {
  description = "Private DNS namespace for internal VPC communication"
  value       = aws_service_discovery_private_dns_namespace.internal.name
}

output "secrets_manager_arn" {
  description = "ARN of the AWS Secrets Manager secret container"
  value       = aws_secretsmanager_secret.app_secrets.arn
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for application logs"
  value       = aws_cloudwatch_log_group.app_logs.name
}

output "ui_service_name" {
  description = "Name of the UI ECS service"
  value       = aws_ecs_service.ui.name
}

output "api_service_name" {
  description = "Name of the API ECS service"
  value       = aws_ecs_service.api.name
}

output "worker_service_name" {
  description = "Name of the Worker ECS service"
  value       = aws_ecs_service.worker.name
}
