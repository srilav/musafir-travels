output "api_base_url" {
  description = "Set this as VITE_API_BASE_URL in Vercel (changes after every destroy/apply)."
  value       = "https://${aws_cloudfront_distribution.api.domain_name}/api/v1"
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.api.domain_name
}

output "alb_dns_name" {
  description = "HTTP-only ALB (debugging only; clients should use api_base_url)."
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_repository_name" {
  description = "GitHub repo variable ECR_REPOSITORY."
  value       = aws_ecr_repository.backend.name
}

output "ecs_cluster_name" {
  description = "GitHub repo variable ECS_CLUSTER."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "GitHub repo variable ECS_SERVICE."
  value       = aws_ecs_service.api.name
}

output "ecs_task_definition_family" {
  description = "GitHub repo variable ECS_TASK_FAMILY."
  value       = aws_ecs_task_definition.api.family
}

output "ecs_container_name" {
  description = "GitHub repo variable ECS_CONTAINER_NAME."
  value       = local.container_name
}

output "private_subnet_ids" {
  description = "Private subnets for the one-off migration task."
  value       = aws_subnet.private[*].id
}

output "private_subnet_ids_csv" {
  description = "GitHub repo variable ECS_SUBNETS (comma-separated)."
  value       = join(",", aws_subnet.private[*].id)
}

output "ecs_tasks_security_group_id" {
  description = "GitHub repo variable ECS_SECURITY_GROUP."
  value       = aws_security_group.ecs_tasks.id
}

output "github_deploy_role_arn" {
  description = "GitHub repo variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.github_deploy.arn
}

output "db_instance_identifier" {
  value = aws_db_instance.main.identifier
}

output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.api.name
}

output "ai_enabled" {
  value = var.ai_enabled
}
