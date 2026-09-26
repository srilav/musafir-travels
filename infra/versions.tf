terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state. The bucket and lock table are created ONCE, manually, before
  # the first `terraform init` (see README.md "One-time bootstrap"). They are
  # deliberately NOT managed by this configuration so `terraform destroy`
  # never deletes the state that describes it.
  #
  # Replace the placeholder values below, or keep them and override at init:
  #   terraform init -backend-config="bucket=<your-bucket>" \
  #                  -backend-config="dynamodb_table=<your-table>"
  backend "s3" {
    bucket         = "REPLACE_ME-musafir-terraform-state"
    key            = "musafir/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "musafir-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  name       = var.project_name
  account_id = data.aws_caller_identity.current.account_id
  region     = var.aws_region
}
