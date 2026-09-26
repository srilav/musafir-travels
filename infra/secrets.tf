# Terraform-managed application secrets. recovery_window_in_days = 0 so a
# destroy/apply cycle can recreate the same names immediately.

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name}/database-url"
  description             = "DATABASE_URL for the Musafir API (managed by Terraform)"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgresql+psycopg://%s:%s@%s:%d/%s?sslmode=require",
    aws_db_instance.main.username,
    urlencode(local.db_master_password),
    aws_db_instance.main.address,
    aws_db_instance.main.port,
    aws_db_instance.main.db_name,
  )
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name}/jwt-secret"
  description             = "JWT_SECRET for the Musafir API (managed by Terraform; regenerates on recreate = everyone logged out)"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

# Externally managed, persistent Anthropic API key (raw key as plaintext).
# Only looked up when AI is enabled, so the stack applies without it.
data "aws_secretsmanager_secret" "ai_api_key" {
  count = var.ai_enabled && var.ai_api_key_secret_name != "" ? 1 : 0
  name  = var.ai_api_key_secret_name
}

locals {
  ai_api_key_secret_arn = length(data.aws_secretsmanager_secret.ai_api_key) > 0 ? data.aws_secretsmanager_secret.ai_api_key[0].arn : null

  # Every secret ARN the task execution role may read.
  app_secret_arns = compact([
    aws_secretsmanager_secret.database_url.arn,
    aws_secretsmanager_secret.jwt_secret.arn,
    local.ai_api_key_secret_arn,
  ])
}
