#!/usr/bin/env bash
# Back up the database, then `terraform destroy` -- only if the backup succeeded.
# Extra arguments are passed to `terraform destroy` (e.g. -auto-approve).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> Step 1/2: backing up RDS"
if ! "${SCRIPT_DIR}/backup.sh"; then
  echo "ERROR: backup failed -- refusing to destroy. Nothing was deleted." >&2
  exit 1
fi

echo "==> Step 2/2: terraform destroy"
terraform -chdir="${INFRA_DIR}" destroy "$@"

echo "==> Destroyed. Snapshots are kept (small ongoing storage cost)."
echo "    Next session: infra/scripts/restore.sh"
