#!/usr/bin/env bash
# Recreate the stack from the most recent manual RDS snapshot.
# Extra arguments are passed to `terraform apply` (e.g. -auto-approve).
#
# Env overrides: AWS_REGION (default us-east-1), DB_INSTANCE_ID (default musafir-db),
# SNAPSHOT_ID (restore a specific snapshot instead of the latest).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
export AWS_REGION="${AWS_REGION:-us-east-1}"
DB_INSTANCE_ID="${DB_INSTANCE_ID:-musafir-db}"

if [[ -z "${SNAPSHOT_ID:-}" ]]; then
  echo "==> Finding latest available manual snapshot of '${DB_INSTANCE_ID}'"
  SNAPSHOT_ID="$(aws rds describe-db-snapshots \
    --db-instance-identifier "${DB_INSTANCE_ID}" \
    --snapshot-type manual \
    --query 'reverse(sort_by(DBSnapshots[?Status==`available`], &SnapshotCreateTime))[0].DBSnapshotIdentifier' \
    --output text)"
fi

if [[ -z "${SNAPSHOT_ID}" || "${SNAPSHOT_ID}" == "None" ]]; then
  echo "ERROR: no available manual snapshot found for '${DB_INSTANCE_ID}'." >&2
  echo "       For a fresh empty database run: terraform -chdir=infra apply" >&2
  exit 1
fi

echo "==> Restoring from snapshot '${SNAPSHOT_ID}'"
terraform -chdir="${INFRA_DIR}" apply -var="restore_from_snapshot=${SNAPSHOT_ID}" "$@"

cat <<MSG

==> Restore applied. Manual follow-ups (see infra/README.md):
  1. ECR is empty: run the deploy workflow (gh workflow run deploy.yml).
  2. CloudFront domain changed: set Vercel VITE_API_BASE_URL to
     $(terraform -chdir="${INFRA_DIR}" output -raw api_base_url 2>/dev/null || echo '<terraform output api_base_url>')
     and REDEPLOY the frontend (Vite bakes env vars at build time).
  3. Update GitHub repo variables if any names/IDs changed (subnets, SG).
MSG
