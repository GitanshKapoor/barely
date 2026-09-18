# ==============================================================================
# Barely Terraform Module - AWS Cloud Map Service Discovery
# Provides zero-exposure private DNS resolution (barely.internal) for
# intra-VPC communication between UI and API.
# ==============================================================================

resource "aws_service_discovery_private_dns_namespace" "internal" {
  name        = "barely.internal"
  description = "Private DNS namespace for internal Barely microservices communication"
  vpc         = var.vpc_id

  tags = {
    Name = "${local.name_prefix}-cloudmap-dns"
  }
}

resource "aws_service_discovery_service" "api" {
  name = "api"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.internal.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = {
    Name = "${local.name_prefix}-sd-api"
  }
}
