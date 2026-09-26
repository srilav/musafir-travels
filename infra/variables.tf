# ---------------------------------------------------------------------------
# General
# ---------------------------------------------------------------------------
variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name prefix for all resources."
  type        = string
  default     = "musafir"
}

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDRs for the two public subnets (ALB, NAT Gateway)."
  type        = list(string)
  default     = ["10.20.0.0/24", "10.20.1.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDRs for the two private subnets (ECS tasks, RDS)."
  type        = list(string)
  default     = ["10.20.10.0/24", "10.20.11.0/24"]
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
variable "db_instance_identifier" {
  description = "RDS instance identifier. Must stay stable: backup.sh/restore.sh look up snapshots by it."
  type        = string
  default     = "musafir-db"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_engine_version" {
  description = "PostgreSQL major (or major.minor) version."
  type        = string
  default     = "16"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GiB."
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Initial database name (ignored when restoring from a snapshot)."
  type        = string
  default     = "musafir"
}

variable "db_username" {
  description = "Master username (ignored when restoring from a snapshot; the snapshot's is kept)."
  type        = string
  default     = "musafir"
}

variable "db_backup_retention_days" {
  description = "Automated backup retention in days (>= 1 keeps automated backups enabled). Free-tier accounts may be capped at a low value."
  type        = number
  default     = 1

  validation {
    condition     = var.db_backup_retention_days >= 1
    error_message = "Automated backups must stay enabled (retention >= 1 day)."
  }
}

variable "db_master_password_secret_name" {
  description = "Name of the PERSISTENT, externally managed Secrets Manager secret holding the RDS master password as a raw plaintext string. Not managed by Terraform."
  type        = string
  default     = "musafir/db-master-password-persistent"
}

variable "restore_from_snapshot" {
  description = "RDS snapshot identifier to create the DB from. Empty (default) = fresh empty database. Set by infra/scripts/restore.sh."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
variable "allowed_origins" {
  description = "Comma-separated CORS origins passed to the API as ALLOWED_ORIGINS (Vercel production domain + preview domains)."
  type        = string
}

variable "jwt_expiry_minutes" {
  description = "JWT expiry in minutes (30 days = 43200)."
  type        = number
  default     = 43200
}

variable "container_port" {
  description = "Port the FastAPI container listens on."
  type        = number
  default     = 8000
}

variable "task_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Fargate task memory (MiB)."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of API tasks to run."
  type        = number
  default     = 1
}

variable "image_tag" {
  description = "Image tag Terraform's task definition references. CI registers new revisions with commit-SHA tags; CI also pushes :latest so this default resolves."
  type        = string
  default     = "latest"
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the API container."
  type        = number
  default     = 14
}

# ---------------------------------------------------------------------------
# Conversational AI (backend-spec.md §11)
# ---------------------------------------------------------------------------
variable "ai_enabled" {
  description = "Enable the AI trip-draft endpoint. Only set true after completing the AI activation checklist in README.md (US$5/month Anthropic budget configured and verified; data-handling policy checked)."
  type        = bool
  default     = false
}

variable "ai_api_key_secret_name" {
  description = "Name of the PERSISTENT, externally managed Secrets Manager secret holding the raw Anthropic API key (plaintext). Looked up only when ai_enabled = true."
  type        = string
  default     = "musafir/anthropic-api-key-persistent"

  validation {
    condition     = !var.ai_enabled || length(var.ai_api_key_secret_name) > 0
    error_message = "ai_api_key_secret_name must be set when ai_enabled = true."
  }
}

variable "ai_provider" {
  description = "AI provider name passed as AI_PROVIDER."
  type        = string
  default     = "anthropic"
}

variable "ai_model" {
  description = "Exact model ID passed as AI_MODEL. Do not substitute an alias (AI-spec.md §2)."
  type        = string
  default     = "claude-haiku-4-5-20251001"
}

variable "ai_timeout_seconds" {
  description = "Provider deadline passed as AI_TIMEOUT_SECONDS."
  type        = number
  default     = 20
}

# ---------------------------------------------------------------------------
# GitHub Actions OIDC
# ---------------------------------------------------------------------------
variable "create_github_oidc_provider" {
  description = "Create the account-wide GitHub OIDC provider. Set false if token.actions.githubusercontent.com already exists in this account."
  type        = bool
  default     = true
}

variable "github_oidc_sub" {
  description = <<-EOT
    EXACT `sub` claim the deploy role trusts. GitHub may embed immutable numeric
    IDs, e.g. "repo:OWNER@123456/REPO@7890123:ref:refs/heads/main" rather than
    the plain "repo:OWNER/REPO:ref:refs/heads/main". Decode a real token from a
    debug workflow step to find it (see README.md) instead of assuming.
  EOT
  type        = string

  validation {
    condition     = startswith(var.github_oidc_sub, "repo:")
    error_message = "github_oidc_sub must be an exact GitHub OIDC sub claim starting with \"repo:\"."
  }
}
