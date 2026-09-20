# ==============================================================================
# Barely — AWS Secrets Manager (zero plaintext secrets in ECS)
# All sensitive values stored here, referenced by ECS tasks via valueFrom.
# ==============================================================================

resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "${local.name_prefix}-secrets"
  description             = "Barely application secrets — DB credentials, AI keys, encryption key"
  recovery_window_in_days = 0

  tags = { Name = "${local.name_prefix}-secrets" }
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id

  secret_string = jsonencode({
    DATABASE_URL      = local.database_url
    BARELY_SECRET_KEY = local.effective_secret_key
    ANTHROPIC_API_KEY = var.anthropic_api_key
    OPENAI_API_KEY    = var.openai_api_key
    GEMINI_API_KEY    = var.gemini_api_key
    GROQ_API_KEY      = var.groq_api_key
  })
}
