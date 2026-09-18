# ==============================================================================
# Barely Terraform Module - Input Variables
# ==============================================================================

variable "aws_region" {
  type        = string
  description = "AWS region for all provisioned resources"
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment name (e.g., prod, staging, dev)"
  default     = "prod"
}

variable "app_name" {
  type        = string
  description = "Application name prefix used across all resources"
  default     = "barely"
}

variable "vpc_id" {
  type        = string
  description = "The target AWS VPC ID where resources will be provisioned"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "List of public subnet IDs for the internet-facing Application Load Balancer"
}

variable "private_app_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs where ECS Fargate tasks run (zero public IPs)"
}

variable "private_data_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for Amazon RDS PostgreSQL"
  default     = []
}

variable "acm_certificate_arn" {
  type        = string
  description = "Optional AWS Certificate Manager (ACM) ARN for HTTPS listener"
  default     = ""
}

# --- Container Images ---
variable "api_image" {
  type        = string
  description = "Docker image URI for barely-api"
  default     = "barely-api:latest"
}

variable "ui_image" {
  type        = string
  description = "Docker image URI for barely-ui"
  default     = "barely-ui:latest"
}

variable "worker_image" {
  type        = string
  description = "Docker image URI for barely-worker"
  default     = "barely-worker:latest"
}

# --- Task Sizing (CPU & Memory) ---
variable "api_cpu" {
  type        = number
  description = "CPU units for the API task (1024 = 1 vCPU)"
  default     = 1024
}

variable "api_memory" {
  type        = number
  description = "Memory for the API task in MB"
  default     = 2048
}

variable "api_desired_count" {
  type        = number
  description = "Desired number of running API tasks"
  default     = 2
}

variable "ui_cpu" {
  type        = number
  description = "CPU units for the UI task (512 = 0.5 vCPU)"
  default     = 512
}

variable "ui_memory" {
  type        = number
  description = "Memory for the UI task in MB"
  default     = 1024
}

variable "ui_desired_count" {
  type        = number
  description = "Desired number of running UI tasks"
  default     = 2
}

variable "worker_cpu" {
  type        = number
  description = "CPU units for the Worker task (2048 = 2 vCPU for Chromium)"
  default     = 2048
}

variable "worker_memory" {
  type        = number
  description = "Memory for the Worker task in MB"
  default     = 4096
}

variable "worker_desired_count" {
  type        = number
  description = "Desired number of running Worker tasks"
  default     = 2
}

variable "fargate_spot_weight" {
  type        = number
  description = "Percentage weight of Worker tasks deployed to Fargate Spot for cost optimization"
  default     = 100
}
