#!/usr/bin/env bash
# Removes everything the Musafir bootstrap created OUTSIDE Terraform:
#   1. manual RDS snapshots      (~$0.095/GB-month)
#   2. Secrets Manager secret    ($0.40/month  <- the only real charge)
#   3. S3 Terraform state bucket (fractions of a cent)
#   4. DynamoDB lock table       ($0 idle)
#
# Run this only when you are done with the project. Afterwards a fresh start
# means redoing the bootstrap from infra/README.md section 1.
#
# It does NOT touch the Terraform-managed stack — run `terraform destroy` first.
set -euo pipefail
export AWS_PAGER=""   # CLI v2 pages output by default, which stalls a script

AWS_REGION="${AWS_REGION:-us-east-1}"
BUCKET="${BUCKET:?set BUCKET to your Terraform state bucket}"
TABLE="${TABLE:-musafir-terraform-locks}"
SECRET="${SECRET:-musafir/db-master-password-persistent}"
AI_SECRET="${AI_SECRET:-musafir/anthropic-api-key-persistent}"
export AWS_REGION

echo "Account: $(aws sts get-caller-identity --query Account --output text)"
echo "Region:  $AWS_REGION"
echo
echo "This will permanently delete:"
echo "  - every manual RDS snapshot named musafir-db-manual-*"
echo "  - secret $SECRET  (no recovery window)"
echo "  - bucket $BUCKET  and all Terraform state versions in it"
echo "  - table  $TABLE"
echo

# Refuse to run while a stack still exists, so state is never orphaned.
LIVE_DB=$(aws rds describe-db-instances --query "length(DBInstances)" --output text 2>/dev/null || echo 0)
if [ "$LIVE_DB" != "0" ]; then
  echo "ERROR: $LIVE_DB RDS instance(s) still exist. Run terraform destroy first." >&2
  exit 1
fi

printf 'Type DELETE to continue: '
read -r CONFIRM
[ "$CONFIRM" = "DELETE" ] || { echo "Aborted; nothing was deleted."; exit 1; }

echo
echo "1/4 RDS snapshots"
SNAPSHOTS=$(aws rds describe-db-snapshots --snapshot-type manual \
  --query "DBSnapshots[?starts_with(DBSnapshotIdentifier,'musafir-db-manual-')].DBSnapshotIdentifier" \
  --output text)
if [ -n "$SNAPSHOTS" ]; then
  for SNAP in $SNAPSHOTS; do
    aws rds delete-db-snapshot --db-snapshot-identifier "$SNAP" \
      --query "DBSnapshot.DBSnapshotIdentifier" --output text
  done
else
  echo "    none found"
fi

echo "2/4 Secrets Manager"
for ID in "$SECRET" "$AI_SECRET"; do
  if aws secretsmanager describe-secret --secret-id "$ID" >/dev/null 2>&1; then
    # --force-delete-without-recovery: no 7-30 day window, gone immediately.
    aws secretsmanager delete-secret --secret-id "$ID" \
      --force-delete-without-recovery --query Name --output text
  else
    echo "    $ID not found"
  fi
done

echo "3/4 S3 bucket (all object versions and delete markers)"
if aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  # The bucket is versioned, so plain `aws s3 rm` would leave old versions
  # behind and delete-bucket would fail with BucketNotEmpty.
  while :; do
    ITEMS=$(aws s3api list-object-versions --bucket "$BUCKET" --max-keys 500 \
      --query '[Versions[].{K:Key,V:VersionId}, DeleteMarkers[].{K:Key,V:VersionId}][]' \
      --output text)
    [ -z "$ITEMS" ] && break
    printf '%s\n' "$ITEMS" | while read -r KEY VERSION; do
      [ -z "${KEY:-}" ] && continue
      aws s3api delete-object --bucket "$BUCKET" --key "$KEY" --version-id "$VERSION" >/dev/null
    done
  done
  aws s3api delete-bucket --bucket "$BUCKET"
  echo "    deleted $BUCKET"
else
  echo "    not found"
fi

echo "4/4 DynamoDB table"
if aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
  aws dynamodb delete-table --table-name "$TABLE" --query "TableDescription.TableName" --output text
  aws dynamodb wait table-not-exists --table-name "$TABLE"
else
  echo "    not found"
fi

echo
echo "Verifying nothing is left..."
printf '  manual snapshots: %s\n' "$(aws rds describe-db-snapshots --snapshot-type manual --query "length(DBSnapshots)" --output text)"
printf '  secrets:          %s\n' "$(aws secretsmanager list-secrets --query "length(SecretList[?starts_with(Name,'musafir/')])" --output text)"
printf '  state bucket:     %s\n' "$(aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1 && echo STILL PRESENT || echo gone)"
printf '  lock table:       %s\n' "$(aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1 && echo STILL PRESENT || echo gone)"
echo
echo "Done. Local leftovers you may also want to remove:"
echo "  rm -rf infra/.terraform infra/.terraform.lock.hcl infra/terraform.tfvars"
