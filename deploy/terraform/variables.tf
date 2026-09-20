# ==============================================================================
# Barely AWS ECS Terraform — Input Variables
# Only db_password and at least one AI provider key are required.
# Everything else has production-ready defaults.
# ==============================================================================

# --- Core ---

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "barely"
}

variable "environment" {
  description = "Deployment environment (e.g. production, staging)"
  type        = string
  default     = "production"
}

# --- Networking ---

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# --- Database ---

variable "db_password" {
  description = "Master password for RDS PostgreSQL (min 8 characters)"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class (db.t3.micro = free tier eligible)"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "barelydb"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "barely_admin"
}

# --- AI Provider Keys (at least one required) ---

variable "anthropic_api_key" {
  description = "Anthropic Claude API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gemini_api_key" {
  description = "Google Gemini API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "groq_api_key" {
  description = "Groq API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "default_model" {
  description = "Default AI model identifier"
  type        = string
  default     = "anthropic/claude-sonnet-4-5"
}

variable "barely_secret_key" {
  description = "AES-256 Fernet encryption key (auto-generated if empty)"
  type        = string
  sensitive   = true
  default     = ""
}

# --- Container Images ---

variable "api_image" {
  description = "Docker image for the API service"
  type        = string
  default     = "docker.io/gitansh16k/barely-api:v1.5"
}

variable "worker_image" {
  description = "Docker image for the Worker service"
  type        = string
  default     = "docker.io/gitansh16k/barely-worker:v1.5"
}

variable "ui_image" {
  description = "Docker image for the UI service"
  type        = string
  default     = "docker.io/gitansh16k/barely-ui:v1.5"
}

# --- ECS Task Sizing ---

variable "api_cpu" {
  description = "CPU units for API task (1024 = 1 vCPU)"
  type        = number
  default     = 1024
}

variable "api_memory" {
  description = "Memory (MiB) for API task"
  type        = number
  default     = 2048
}

variable "api_desired_count" {
  description = "Number of API task replicas"
  type        = number
  default     = 1
}

variable "worker_cpu" {
  description = "CPU units for Worker task (2048 recommended for Chromium)"
  type        = number
  default     = 2048
}

variable "worker_memory" {
  description = "Memory (MiB) for Worker task (4096 recommended for Chromium)"
  type        = number
  default     = 4096
}

variable "worker_desired_count" {
  description = "Number of Worker task replicas"
  type        = number
  default     = 1
}

variable "ui_cpu" {
  description = "CPU units for UI task"
  type        = number
  default     = 512
}

variable "ui_memory" {
  description = "Memory (MiB) for UI task"
  type        = number
  default     = 1024
}

variable "ui_desired_count" {
  description = "Number of UI task replicas"
  type        = number
  default     = 1
}
