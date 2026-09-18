# ==============================================================================
# Barely - AWS ECS Fargate Terraform Module
# Production Deployment: Application Load Balancer, AWS Cloud Map Private DNS,
# Tiered Security Groups, Non-Root Fargate Tasks, Zero-Plaintext Secrets Manager.
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Barely"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

locals {
  name_prefix = "${var.app_name}-${var.environment}"
}
