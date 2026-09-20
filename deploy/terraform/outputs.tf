# ==============================================================================
# Barely — Terraform Outputs
# ==============================================================================

output "dashboard_url" {
  description = "Barely Web Dashboard URL"
  value       = "http://${aws_lb.main.dns_name}"
}

output "api_docs_url" {
  description = "FastAPI interactive documentation"
  value       = "http://${aws_lb.main.dns_name}/docs"
}

output "alb_dns_name" {
  description = "ALB DNS name (use for Route 53 CNAME/alias)"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID (for Route 53 alias records)"
  value       = aws_lb.main.zone_id
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.main.address
}

output "rds_port" {
  description = "RDS PostgreSQL port"
  value       = aws_db_instance.main.port
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "secrets_manager_arn" {
  description = "AWS Secrets Manager secret ARN (contains all app secrets)"
  value       = aws_secretsmanager_secret.app_secrets.arn
}

output "cloudmap_namespace" {
  description = "Cloud Map private DNS namespace"
  value       = aws_service_discovery_private_dns_namespace.main.name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for all services"
  value       = aws_cloudwatch_log_group.app.name
}

output "nat_gateway_ip" {
  description = "NAT Gateway public IP (for firewall whitelisting)"
  value       = aws_eip.nat.public_ip
}
