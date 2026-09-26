#!/usr/bin/env bash
# Take a manual RDS snapshot and wait until it is available.
# Exits non-zero unless the snapshot completed successfully.
#
# Env overrides: AWS_REGION (default us-east-1), DB_INSTANCE_ID (default: from
# `terraform output`, falling back to musafir-db).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
export AWS_REGION="${AWS_REGION:-us-east-1}"

if [[ -z "${DB_INSTANCE_ID:-}" ]]; then
  DB_INSTANCE_ID="$(terraform -chdir="${INFRA_DIR}" output -raw db_instance_identifier 2>/dev/null || true)"
  DB_INSTANCE_ID="${DB_INSTANCE_ID:-musafir-db}"
fi

echo "==> Checking RDS instance '${DB_INSTANCE_ID}' in ${AWS_REGION}"
status="$(aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE_ID}" \
  --query 'DBInstances[0].DBInstanceStatus' --output text)"
if [[ "${status}" != "available" ]]; then
  echo "ERROR: instance status is '${status}', expected 'available'." >&2
  exit 1
fi

SNAPSHOT_ID="${DB_INSTANCE_ID}-manual-$(date -u +%Y%m%d-%H%M%S)"
echo "==> Creating snapshot '${SNAPSHOT_ID}'"
aws rds create-db-snapshot \
  --db-instance-identifier "${DB_INSTANCE_ID}" \
  --db-snapshot-identifier "${SNAPSHOT_ID}" \
  --tags Key=Project,Value=musafir Key=CreatedBy,Value=backup.sh >/dev/null

echo "==> Waiting for snapshot to become available (this can take several minutes)"
# The CLI waiter gives up after ~30 min; loop a few times for large DBs.
for attempt in 1 2 3; do
  if aws rds wait db-snapshot-available --db-snapshot-identifier "${SNAPSHOT_ID}"; then
    break
  fi
  echo "    waiter attempt ${attempt} timed out/failed; re-checking..."
done

final_status="$(aws rds describe-db-snapshots \
  --db-snapshot-identifier "${SNAPSHOT_ID}" \
  --query 'DBSnapshots[0].Status' --output text)"
if [[ "${final_status}" != "available" ]]; then
  echo "ERROR: snapshot '${SNAPSHOT_ID}' status is '${final_status}', not 'available'." >&2
  exit 1
fi

echo "==> Snapshot '${SNAPSHOT_ID}' is available."
