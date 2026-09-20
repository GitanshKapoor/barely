# ==============================================================================
# Barely — AWS ECS Fargate Terraform
# Fully self-contained: creates VPC, subnets, NAT, RDS, ECS, ALB, Secrets Manager.
# User fills in db_password + at least one AI key. That's it.
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)
}

# Auto-generate encryption key if not provided
resource "random_password" "secret_key" {
  length  = 64
  special = false
}
