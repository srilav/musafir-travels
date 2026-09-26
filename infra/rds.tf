# Persistent master password: created once, outside Terraform (README.md
# bootstrap). Reading it via a data source keeps it stable across
# destroy/apply cycles, so it always matches the password embedded in any
# snapshot we restore from.
data "aws_secretsmanager_secret_version" "db_master_password" {
  secret_id = var.db_master_password_secret_name
}

locals {
  restoring          = var.restore_from_snapshot != ""
  db_master_password = data.aws_secretsmanager_secret_version.db_master_password.secret_string
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db-subnets"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${local.name}-db-subnets" }
}

resource "aws_db_instance" "main" {
  identifier     = var.db_instance_identifier
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  # When restoring, name/username come from the snapshot.
  snapshot_identifier = local.restoring ? var.restore_from_snapshot : null
  db_name             = local.restoring ? null : var.db_name
  username            = local.restoring ? null : var.db_username
  password            = local.db_master_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = var.db_backup_retention_days
  copy_tags_to_snapshot      = true
  auto_minor_version_upgrade = true
  apply_immediately          = true
  deletion_protection        = false

  # Manual snapshots are taken by infra/scripts/backup.sh before destroy;
  # final_snapshot_identifier needs a static unique name, which does not fit
  # repeated destroy/apply cycles.
  skip_final_snapshot = true

  lifecycle {
    # snapshot_identifier only matters at creation. Without this, a plain
    # `terraform apply` after a restore (variable back to "") would plan to
    # REPLACE the database.
    ignore_changes = [snapshot_identifier]
  }

  tags = { Name = var.db_instance_identifier }
}
