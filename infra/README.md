# Musafir Travels — AWS infrastructure (Terraform)

Everything the backend needs on AWS (`us-east-1` by default):

```
Vercel SPA ──HTTPS──> CloudFront (*.cloudfront.net, no caching)
                        │ HTTP
                        ▼
              ALB :80 (public subnets, only CloudFront IP ranges)
                        │
                        ▼
      ECS Fargate "api" :8000 (private subnets) ──> NAT ──> ECR / Anthropic API
                        │
                        ▼
            RDS PostgreSQL db.t4g.micro (private, only from ECS SG)
```

| File | Contents |
|------|----------|
| `versions.tf` | Providers, S3 backend + DynamoDB lock |
| `network.tf` | VPC, 2 public + 2 private subnets in 2 AZs, 1 NAT Gateway, security groups |
| `rds.tf` | RDS PostgreSQL; master password from persistent secret; `restore_from_snapshot` |
| `secrets.tf` | TF-managed `DATABASE_URL` + `JWT_SECRET` secrets; optional Anthropic key lookup |
| `ecr.tf`, `ecs.tf` | ECR repo, cluster, task definition, service, log group |
| `alb.tf`, `cloudfront.tf` | HTTP ALB (`/health` checks) and HTTPS CloudFront in front of it |
| `iam.tf` | Task execution role, task role, GitHub OIDC provider + deploy role |
| `outputs.tf` | `api_base_url`, ECR/ECS names, subnets/SG for the migration task, role ARN |
| `scripts/` | `backup.sh`, `destroy.sh`, `restore.sh` |

> **COST WARNING.** The NAT Gateway (~$0.045/hr), ALB (~$0.0225/hr), RDS and
> Fargate are billed **hourly** while the stack exists. A few-hour session costs
> cents; leaving it up costs ~$50+/month. **Run `scripts/destroy.sh` after every
> session.** Snapshots survive the destroy and cost ~$0.095/GB-month.

---

## 1. One-time bootstrap (manual, never managed by this Terraform)

Prerequisites: AWS CLI v2 authenticated as an admin, Terraform >= 1.9, `gh` CLI (optional).

### 1a. Terraform state bucket + lock table

```bash
export AWS_REGION=us-east-1
BUCKET=<globally-unique-name>-musafir-terraform-state   # pick your own
TABLE=musafir-terraform-locks

aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION"
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws dynamodb create-table --table-name "$TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

Then either edit the placeholder `bucket`/`dynamodb_table` in `versions.tf`, or
pass them at init: `terraform init -backend-config="bucket=$BUCKET" -backend-config="dynamodb_table=$TABLE"`.

### 1b. Persistent DB master password secret

Stored as a **raw plaintext string** (not JSON). RDS forbids `/`, `@`, `"` and spaces.

```bash
PW=$(aws secretsmanager get-random-password --password-length 32 \
      --exclude-characters '/@"\ '"'"'' --query RandomPassword --output text)
aws secretsmanager create-secret --name musafir/db-master-password-persistent \
  --description "Musafir RDS master password (persistent; NOT managed by Terraform)" \
  --secret-string "$PW"
unset PW
```

Never rotate it by hand: every snapshot embeds the password it was taken with.

### 1c. Anthropic API key secret (needed only before enabling AI)

The secret value is the **raw key as plaintext** (not JSON) — ECS injects it
verbatim as `AI_API_KEY`.

```bash
read -rs ANTHROPIC_KEY   # paste key, press Enter (keeps it out of shell history)
aws secretsmanager create-secret --name musafir/anthropic-api-key-persistent \
  --description "Musafir Anthropic API key (persistent; NOT managed by Terraform)" \
  --secret-string "$ANTHROPIC_KEY"
unset ANTHROPIC_KEY
```

### 1d. Find the exact GitHub OIDC `sub` claim

GitHub may issue a `sub` that embeds immutable numeric IDs, e.g.
`repo:OWNER@123456/REPO@7890123:ref:refs/heads/main`, **not** the plain
`repo:OWNER/REPO:ref:refs/heads/main` that older docs show. The deploy role's
trust policy uses an exact `StringEquals`, so find the real value rather than
guessing: add a temporary workflow with `permissions: id-token: write` that
requests a token and prints only its claims, e.g.

```yaml
- run: |
    TOKEN=$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
      "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" | jq -r .value)
    echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null | jq '{sub, repository, ref}'
```

Run it from `main` (the deploy workflow runs on `main`; `workflow_dispatch` on
`main` yields the same `sub`). Put the value in `github_oidc_sub`, then delete
the debug workflow. Don't add a GitHub `environment:` to the deploy job without
updating the sub — environments change the claim to `...:environment:<name>`.

---

## 2. Apply

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # fill in allowed_origins, github_oidc_sub
terraform init
terraform apply                                  # fresh empty DB
```

### GitHub repository settings (Settings → Secrets and variables → Actions → Variables)

| Variable | Value |
|----------|-------|
| `AWS_REGION` | `us-east-1` |
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` (may be a secret instead) |
| `ECR_REPOSITORY` | `terraform output -raw ecr_repository_name` |
| `ECS_CLUSTER` | `terraform output -raw ecs_cluster_name` |
| `ECS_SERVICE` | `terraform output -raw ecs_service_name` |
| `ECS_TASK_FAMILY` | `terraform output -raw ecs_task_definition_family` |
| `ECS_CONTAINER_NAME` | `terraform output -raw ecs_container_name` |
| `ECS_SUBNETS` | *(optional)* `terraform output -raw private_subnet_ids_csv` |
| `ECS_SECURITY_GROUP` | *(optional)* `terraform output -raw ecs_tasks_security_group_id` |

Subnet and SG IDs change on every destroy/apply. If `ECS_SUBNETS` /
`ECS_SECURITY_GROUP` are left **unset**, `deploy.yml` reads them from the ECS
service's current network configuration, which avoids stale values. If you set
them, update them after each recreate. The names above are stable.

Then run the deploy workflow once (the fresh ECR repo is empty, so the service
cannot start tasks until an image exists):
`gh workflow run deploy.yml` (or Actions → Deploy backend → Run workflow).

Set Vercel's `VITE_API_BASE_URL` to `terraform output -raw api_base_url` and redeploy the frontend.

### How config reaches the container

- Secrets (Secrets Manager → ECS `secrets`): `DATABASE_URL`
  (`postgresql+psycopg://…?sslmode=require`), `JWT_SECRET`, and `AI_API_KEY`
  only when `ai_enabled = true`.
- Plain env: `ALLOWED_ORIGINS`, `JWT_EXPIRY_MINUTES=43200`, `AI_ENABLED`,
  `AI_PROVIDER=anthropic`, `AI_MODEL=claude-haiku-4-5-20251001`, `AI_TIMEOUT_SECONDS=20`.
- The execution role can `secretsmanager:GetSecretValue` on exactly those secret ARNs.
- The ECS service ignores `task_definition` changes from Terraform (CI owns
  the running revision). After changing app config in Terraform (e.g. enabling
  AI or new `allowed_origins`), run `deploy.yml`: it copies the **latest**
  revision of the family (Terraform's) and swaps in the new image.

---

## 3. Session lifecycle: destroy, backup, restore

```bash
infra/scripts/destroy.sh     # snapshot RDS, wait for 'available', THEN terraform destroy
infra/scripts/restore.sh     # latest manual snapshot -> terraform apply -var=restore_from_snapshot=<id>
infra/scripts/backup.sh      # snapshot only
```

- `destroy.sh` refuses to destroy if the snapshot fails or doesn't complete.
- `restore.sh` accepts `SNAPSHOT_ID=<id>` to pick a specific snapshot; extra
  args pass through to `terraform` (e.g. `-auto-approve`).
- `aws_db_instance.main` ignores later changes to `snapshot_identifier`, so a
  plain `terraform apply` after a restore will not replace the database.
- Old snapshots are never deleted automatically; prune them occasionally.
- `JWT_SECRET` is regenerated when the stack is recreated (everyone is logged out; no data loss).

### Post-restore follow-ups (manual)

1. **ECR is empty** after a recreate — run `gh workflow run deploy.yml` (no code change needed).
2. **CloudFront has a new domain** — update Vercel's `VITE_API_BASE_URL` to the new
   `terraform output -raw api_base_url` and **trigger a Vercel redeploy** (Vite bakes
   env vars in at build time; saving the value alone does nothing).
3. If you pinned `ECS_SUBNETS` / `ECS_SECURITY_GROUP` repo variables, update them.

---

## 4. AI activation checklist (`ai_enabled = true`)

Keep `ai_enabled = false` (the default; the API returns `503` for AI requests and
manual trip creation keeps working) until **all** of these are done and recorded:

- [ ] **US$5/month budget configured and verified** in the Anthropic Console for the
      key's workspace/organization (spend limit covering all users and backend
      instances). The API's 10 req/user/60 s in-memory throttle is **not** a spending cap.
      If the console cannot enforce this amount and scope, document an alternative
      before release (AI-spec.md §9).
- [ ] **Data-handling policy checked:** the Anthropic account uses the approved standard
      API data-handling/retention policy (zero data retention not required).
- [ ] Anthropic key stored in `musafir/anthropic-api-key-persistent` as a raw plaintext
      string (§1c). Never put it in the frontend, tfvars, or GitHub.
- [ ] Optional live evaluation run per `backend/README.md` (`python -m scripts.evaluate_ai --run-live`).

Then set `ai_enabled = true`, `terraform apply`, and run `deploy.yml` so the service
picks up the new task-definition revision (with `AI_API_KEY`).

To turn AI off again: `ai_enabled = false`, apply, deploy. The persistent key secret
is untouched by Terraform in either direction.

---

## 5. Coming back to this: what to expect

Verified end to end on a fresh AWS account (2026-09-27): bootstrap → `init` →
`plan` → `apply` → `destroy` → full cleanup. Roughly 40 minutes of stack uptime
cost **7 cents**.

### Before you start

- **`aws configure` region must be a real region** (`us-east-1`), not `global`.
  A region of `global` builds the endpoint `https://sts.global.amazonaws.com/`,
  which does not resolve — the error looks like a network fault, not a typo.
- **`export AWS_PAGER=""`** for the session. CLI v2 pipes output through a pager,
  so a long-running script stops at `(END)` waiting for a keypress.
- `terraform.tfvars` is git-ignored, so a fresh clone has none. Copy the example
  and fill in `allowed_origins` and `github_oidc_sub`; both are required and
  neither has a default, so `plan` stops immediately without them.
- Section 1's bootstrap (state bucket, lock table, DB password secret) must
  exist first. `rds.tf` reads the password through a data source, so `plan`
  fails on a missing secret before it reaches any resource.

### During the run

| What you'll see | Meaning |
|---|---|
| `dynamodb_table is deprecated. Use use_lockfile` on `init` | Harmless; the lock still works. |
| `plan` reports **41 to add, 0 to change, 0 to destroy** | Correct for an empty account. |
| `apply` takes 20-30 min | RDS ~10 min; CloudFront 15-20 min (create *and* delete). |
| ECS service sits at **0/1 running** | Correct: ECR is empty until the first `deploy.yml` run. |
| curl to the ALB **times out** from your laptop | Correct: the ALB's security group admits only CloudFront's IP ranges. Without CloudFront there is no ingress path at all. |

### Known first-run blockers

- **CloudFront on a new account returns `AccessDenied: Your account must be
  verified before you can add new CloudFront resources`.** Everything else
  applies normally (40 of 41 resources); only the distribution fails. Open an
  AWS Support case quoting the error and its request ID. Once cleared, re-run
  `terraform apply` — it adds the distribution alone.
- **If an apply fails partway, do not re-run it and do not delete
  `errored.tfstate` if one appears.** Terraform writes that file when it cannot
  persist state to S3; push it back with `terraform state push errored.tfstate`
  before anything else, or the next apply will try to recreate live resources.
- **`tfplan` holds the DB password and JWT secret in plaintext.** It is
  git-ignored; delete it once the apply succeeds.

### Tearing down

`scripts/destroy.sh` snapshots RDS, verifies the snapshot reached `available`,
and only then destroys — it refuses to delete anything if the backup fails.
A bare `terraform destroy` **skips the snapshot entirely** (`skip_final_snapshot
= true`), so it is only safe while the database holds nothing you want.

The snapshot, the state bucket, the lock table and the persistent secrets all
survive a destroy by design. When you are finished with the project for good,
`scripts/clean-bootstrap.sh` removes that layer too:

```bash
BUCKET=<your-state-bucket> infra/scripts/clean-bootstrap.sh
```

It refuses to run while any RDS instance exists, empties the versioned state
bucket (plain `aws s3 rm` leaves old versions behind, and the bucket will not
delete), and force-deletes the secrets with no recovery window. Of those, only
Secrets Manager bills meaningfully — **$0.40 per secret per month**; the bucket
and the idle lock table are effectively free.

Afterwards, `infra/.terraform/` is ~870 MB of provider plugins and can be
deleted; `.terraform.lock.hcl` is committed and should be kept.
