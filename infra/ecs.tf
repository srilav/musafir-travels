resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

locals {
  container_name = "api"

  container_environment = [
    { name = "ALLOWED_ORIGINS", value = var.allowed_origins },
    { name = "JWT_EXPIRY_MINUTES", value = tostring(var.jwt_expiry_minutes) },
    { name = "AI_ENABLED", value = tostring(var.ai_enabled) },
    { name = "AI_PROVIDER", value = var.ai_provider },
    { name = "AI_MODEL", value = var.ai_model },
    { name = "AI_TIMEOUT_SECONDS", value = tostring(var.ai_timeout_seconds) },
  ]

  container_secrets = concat(
    [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
    ],
    local.ai_api_key_secret_arn == null ? [] : [
      { name = "AI_API_KEY", valueFrom = local.ai_api_key_secret_arn },
    ],
  )
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64" # GitHub-hosted ubuntu runners build amd64 images
  }

  container_definitions = jsonencode([{
    name      = local.container_name
    image     = "${aws_ecr_repository.backend.repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    environment = local.container_environment
    secrets     = local.container_secrets

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])

  # Make sure the secret values exist before a task can start.
  depends_on = [
    aws_secretsmanager_secret_version.database_url,
    aws_secretsmanager_secret_version.jwt_secret,
  ]
}

resource "aws_ecs_service" "api" {
  name            = "${local.name}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = local.container_name
    container_port   = var.container_port
  }

  lifecycle {
    # deploy.yml registers new revisions (image = commit SHA) and points the
    # service at them; don't let `terraform apply` roll that back.
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.http]
}
