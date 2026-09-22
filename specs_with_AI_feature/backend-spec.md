# Backend Spec — Trip Planner

> Defines the server, data model, and business logic. Should serve the endpoints defined in `api-contract-spec.md` and support the use cases in `goal-spec.md`.

## 1. Tech Stack
<!-- Language/framework (Node/Express, Python/FastAPI, etc.), database, ORM, auth library, hosting target. -->
- Language/framework: Python 3.12 + FastAPI
- ORM/migrations: SQLAlchemy 2.0 + Alembic
- Database: PostgreSQL
- Validation/serialization: Pydantic (via FastAPI)
- Auth: JWT bearer tokens (`python-jose` or `pyjwt`), passwords hashed with `passlib[bcrypt]`
- Server: Uvicorn (ASGI), packaged as a Docker container
- Hosting: AWS ECS Fargate (containerized API) behind an Application Load Balancer, fronted by CloudFront for HTTPS, database on AWS RDS for PostgreSQL
- Infrastructure as code: Terraform (VPC, RDS, ECS cluster/service/task definition, ALB, CloudFront, ECR repo, IAM roles)
- CI/CD: GitHub Actions (test → build/push Docker image to ECR → deploy to ECS on merge to `main`)

## 2. Architecture Overview
<!-- Monolith vs. services, request flow, key layers (controllers/services/repositories), any background jobs or queues. -->
Single monolithic FastAPI app, with no background jobs or queues. The AI service uses asynchronous outbound HTTP within the request lifecycle. Layers:
- **Routers** (`app/routers/`) — FastAPI path operations per resource (`auth`, `trips`, `days`, `activities`); parse/validate the request via Pydantic schemas and call services.
- **Services** (`app/services/`) — business logic (e.g. creating a Trip's Day rows, ownership checks).
- **Models** (`app/models/`) — SQLAlchemy ORM models mapping to Postgres tables.
- **Schemas** (`app/schemas/`) — Pydantic request/response models, kept in sync with `api-contract-spec.md`.

Request flow: client → router (auth dependency validates JWT) → service (business rules, ownership check) → SQLAlchemy session → Postgres → response mapped through a Pydantic schema.

## 3. Data Model
<!-- Entities and relationships. One table per entity: fields, types, constraints. e.g. User, Trip, Destination, ItineraryItem. -->
Entities mirror the glossary in `goal-spec.md`: User, Trip, Day, Activity. (`Destination` and `Itinerary` are not separate tables — Destination is a field on Trip, and Itinerary is just "a Trip's Days and Activities".)

### Entity: `User`
| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| username | string | unique, not null | |
| password_hash | string | not null | bcrypt hash, never the raw password |
| created_at | timestamp | not null, default now | |

### Entity: `Trip`
| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| user_id | UUID | FK → `User.id`, not null | owner |
| destination | string | not null | |
| start_date | date | not null | |
| end_date | date | not null, ≥ `start_date` | |
| trip_type | enum | not null | `solo`, `couple`, `family`, `group_of_friends` |
| created_at | timestamp | not null, default now | |

### Entity: `Day`
| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| trip_id | UUID | FK → `Trip.id`, not null | |
| day_number | int | not null | 1..N, N = trip length in days |
| date | date | not null | `start_date + (day_number - 1)` |
| | | unique (`trip_id`, `day_number`) | |

### Entity: `Activity`
| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| day_id | UUID | FK → `Day.id`, not null | |
| text | string | not null, non-empty (trimmed) | free-text activity description |
| sort_order | int | not null, default 0 | order of activities within a day |
| created_at | timestamp | not null, default now | |

### Relationships
<!-- e.g. User has many Trips; Trip has many Destinations -->
- `User` has many `Trip` (1:N), scoped by `user_id`.
- `Trip` has many `Day` (1:N) — Days are auto-created when a Trip is created (see §4), not submitted by the client.
- `Day` has many `Activity` (1:N).
- Deleting a `Trip` cascades to delete its `Day`s and their `Activity`s.

## 4. Business Logic & Rules
<!-- Validation rules, computed fields, ordering logic, edge cases (e.g. overlapping dates, empty trips). -->
- **Trip creation:** `end_date` must be ≥ `start_date`, and the trip may be at most 60 days long, inclusive (400 if either fails — caps a mistyped year from creating hundreds of Days). On success, the service computes N = (`end_date` − `start_date`).days + 1 and creates N `Day` rows (`day_number` 1..N, `date` = `start_date` + offset) in the same transaction as the Trip — the client never creates/deletes Days directly.
- **Activity text:** required, trimmed, rejects empty/whitespace-only strings (400).
- **Activity order:** a new Activity gets `sort_order` = (highest `sort_order` in its Day) + 1, or `0` if the Day is empty. Editing text never changes it; deleting leaves gaps (no renumbering). No reorder endpoint (§10).
- **Ownership:** every Trip/Day/Activity operation checks the resource belongs to the authenticated user (`Trip.user_id == current_user.id`, transitively for its Days/Activities). A resource that exists but belongs to another user returns `404` (not `403`) to avoid confirming it exists.
- **No overlapping-trip validation:** a user may have multiple trips with overlapping dates — out of scope per `goal-spec.md`.
- **No auto-suggested activities/plans:** explicitly out of scope per `goal-spec.md`.

## 5. Authentication & Authorization
<!-- Auth strategy (JWT/session/OAuth), password handling, role/permission model, who can access/modify what. -->
- **Strategy:** JWT bearer tokens, matching the frontend's `Authorization: Bearer <token>` expectation (`frontend-spec.md` §5/§8).
- **Login:** `POST /auth/login` verifies username + password (bcrypt) and returns a signed JWT (`JWT_SECRET`, expiry 30 days — no refresh-token flow for MVP; re-login once it expires).
- **Signup:** `POST /auth/signup` creates a new account (username + bcrypt-hashed password) and returns a token in the same shape as login, so the client is immediately logged in. Signup validation is minimal: `username` trimmed and non-empty, `password` at least 8 characters (`422` otherwise); login applies no format rules. `username` must be unique (`400` if taken, consistent with other business-rule validation — no `403`/`409` in this API's status-code set, see §8). This is basic username/password signup only — email-based auth/password reset is still deferred to post-MVP per `goal-spec.md`.
- **Authorization:** application data and AI routes require a valid JWT; `/auth/login`, `/auth/signup`, and the infrastructure health check are public. Protected routes use a FastAPI authentication dependency; the authenticated `user_id` scopes all Trip/Day/Activity queries. No roles/permission tiers — a user can only ever see/modify their own data.
- An expired/invalid/missing token returns `401`.
## 6. Third-Party Integrations
<!-- Maps, geocoding, weather, flight/hotel data, email, etc. Include what each is used for. -->
- Approved AI enhancement: a hosted model API for conversational trip-field extraction, called only from the backend (`AI-spec.md`). Use Anthropic Claude Haiku (`claude-haiku-4-5-20251001`); use the official Anthropic Python SDK and use pinned version `1.6.0`. No maps/geocoding/weather/email or auto-generated itinerary content. PDF export remains client-side.

## 7. Non-Functional Requirements
<!-- Performance/scalability targets, rate limiting, caching strategy, logging/monitoring, expected load. -->
- Expected load: a single user or a small handful of personal accounts (open username/password signup, but personal-scale usage) — no performance/scalability targets beyond "feels instant" for this scale, even though the AWS setup has headroom to scale further later.
- Existing CRUD rate limiting remains out of scope. The proposed AI endpoint has separate request limits because calls incur provider usage; see §11.
- Caching: none — Postgres queries at this scale don't need a cache layer.
- Logging: Uvicorn's default access/error logs are sufficient; no external monitoring/APM for MVP.

## 8. Error Handling
<!-- Standard error response shape, how validation errors vs. server errors vs. auth errors are surfaced. (Should match api-contract-spec.md) -->
- Uses FastAPI's default conventions: `HTTPException` → `{"detail": "<message>"}`; Pydantic validation failures → `422` with FastAPI's standard `detail` array of field errors.
- Status codes: `400` business-rule validation (e.g. `end_date` before `start_date`, empty activity text), `401` missing/invalid/expired JWT, `404` resource not found or not owned by the caller, `422` request-shape validation, `500` unhandled error.
- The binding error shape and full status-code set (including the AI endpoint's `429`/`502`/`503`/`504`, see §11) are defined in `api-contract-spec.md` §3 and §6; this section must stay consistent with them.
## 9. Environment & Deployment
<!-- Env vars, config management, deployment target, migrations strategy. -->
- **Env vars/secrets:** `DATABASE_URL` (RDS connection string), `JWT_SECRET`, `JWT_EXPIRY_MINUTES` (`43200` = 30 days; the API reports the same lifetime in **seconds** as `expires_in`), `ALLOWED_ORIGINS` (comma-separated, for CORS). Stored as ECS task definition secrets sourced from AWS Secrets Manager (not plain environment variables) for `DATABASE_URL`/`JWT_SECRET`; non-secret config (`ALLOWED_ORIGINS`, `JWT_EXPIRY_MINUTES`) as plain task-definition env vars.
- **Migrations:** Alembic; run as a one-off ECS task (`alembic upgrade head`) triggered by the deploy pipeline before the new app version receives traffic.
- **Seeding:** none needed — accounts are created via `POST /auth/signup` (§5).

### Infrastructure (Terraform)
- **VPC:** private subnets for ECS tasks and RDS, routed to the internet via a **NAT Gateway**; public subnets for the ALB and the NAT Gateway itself. RDS is not publicly accessible — only reachable from the ECS tasks' security group. Standard "production-shaped" network isolation — reconsidered and kept (see cost note below) rather than the leaner public-subnet-for-ECS alternative, since AWS bills these hourly and this project's usage pattern is short/bursty, not always-on.
- **RDS:** PostgreSQL instance (smallest instance class appropriate for this scale, e.g. `db.t4g.micro` — free-tier eligible for a new AWS account's first 12 months), automated backups enabled. Master password is read from a **persistent** Secrets Manager secret (bootstrapped once, outside Terraform — see Backup & Restore below), not generated fresh on every `apply`, so it stays stable across destroy/recreate cycles.
- **ECR:** one repository for the backend's Docker image.
- **ECS:** Fargate cluster, one service running the FastAPI container in the private subnets, task definition referencing the ECR image + env vars/secrets above.
- **ALB:** HTTP-only listener (port 80) routing to the ECS service's target group, health-checked against `/health`. No ACM cert/custom domain — gives a stable DNS name (Fargate task IPs change on every redeploy) plus health-checked rolling deploys, but is plain HTTP.
- **CloudFront:** sits in front of the ALB, terminating HTTPS on CloudFront's default `*.cloudfront.net` domain (AWS-managed certificate, no custom domain needed). Added because the Vercel frontend is always served over HTTPS, and browsers block `fetch`/XHR calls from an HTTPS page to a plain-HTTP API ("mixed content") — without this, the deployed frontend couldn't reach the API at all. CloudFront→ALB traffic stays HTTP (internal to AWS); caching is disabled (`Managed-CachingDisabled`) and all headers/cookies/query strings are forwarded untouched (`Managed-AllViewer`), since this fronts an API, not static content. The frontend's `VITE_API_BASE_URL` (`frontend-spec.md` §10) points at this CloudFront URL, not the ALB directly.
- **IAM:** a task execution role (pull from ECR, read Secrets Manager) and a narrowly-scoped deploy role for GitHub Actions (via OIDC — no long-lived AWS access keys stored in GitHub). The OIDC trust policy matches on the exact `sub` claim GitHub issues (`repo:OWNER@id/REPO@id:ref:refs/heads/main` — GitHub embeds immutable numeric IDs after the owner/repo names, not the plain `OWNER/REPO` form older docs describe), found by decoding a token in a debug workflow step rather than assumed in advance.
- Terraform state stored remotely (e.g. an S3 backend with DynamoDB locking) rather than locally, so it isn't tied to one machine.
- **Cost note:** NAT Gateway (~$0.045/hr) and ALB (~$0.0225/hr) are billed **hourly**, not as flat monthly fees — the widely-quoted "~$33/month" and "~$17/month" figures assume the stack runs continuously for a full month. Since this app is only expected to be used for a few hours at a time, actual cost for a usage session is a few dozen cents, not tens of dollars. CloudFront adds negligible cost at this scale (well within its 10M-requests/month free tier). **Run `terraform destroy` after each session** (or whenever the app isn't actively being used) to avoid accumulating the full monthly rate — this setup is meant to be spun up and torn down, not left running. RDS snapshots (see Backup & Restore below) persist through a destroy and add a small ongoing storage cost (~$0.095/GB-month beyond the free allotment) — not $0 idle cost, but close to it, and nowhere near the running-compute rate.

### Backup & Restore (RDS snapshots)
Destroying the stack between sessions (see cost note above) also deletes RDS, and with it every trip a user created — unacceptable once the app holds real data instead of just being a cost experiment. Snapshots decouple "torn down to save money" from "data is gone":
- **Backup before destroy:** a manual RDS snapshot (`aws rds create-db-snapshot`), not Terraform's `final_snapshot_identifier` — the latter needs a statically unique name known at plan time, which doesn't fit a repeated destroy→apply→destroy cycle. A wrapper script takes the snapshot and waits for it to finish *before* invoking `terraform destroy`, and refuses to destroy if the snapshot didn't complete.
- **Restore on the next apply:** `aws_db_instance.main` accepts a `snapshot_identifier` (wired to a Terraform variable, empty by default = fresh empty DB, as it is today) — set it to the latest snapshot's ID to restore instead of creating blank. A wrapper script finds the most recent snapshot and passes it through.
- **Why the master password is no longer `random_password`:** an RDS snapshot embeds the master password *as it was at snapshot time*. If Terraform generated a fresh random password on every `apply` (as it did through Phase 6), a post-restore instance would end up with a mismatch between the snapshot's real password and whatever Terraform just told Secrets Manager to hand the app — silently breaking DB connectivity in a confusing way, since RDS never exposes the master password for Terraform to detect the drift. Making the password persistent (read from a secret that isn't part of the destroyable state) sidesteps the mismatch entirely: it never changes, so there's nothing to reconcile.
- **Persistent secret bootstrap:** `musafir/db-master-password-persistent`, created once via `aws secretsmanager create-secret` (same one-time-manual-step pattern already used for the S3/DynamoDB Terraform state backend, §10 Open Questions) — never managed by, or destroyed with, the main Terraform config. `rds.tf` reads it via a data source.
- **Scripts** (`infra/scripts/`): `backup.sh` (snapshot + wait for completion), `destroy.sh` (runs `backup.sh`, then `terraform destroy` — only if the backup succeeded), `restore.sh` (finds the latest snapshot, runs `terraform apply -var=restore_from_snapshot=<id>`).
- **After a restore, two things need a manual follow-up, both because `destroy`/`apply` recreates rather than resumes the stack:**
  1. **ECR comes back empty** (the repo itself is destroyed and recreated) — the ECS service has no image to run until the next backend deploy. Trigger one with no code changes via `deploy.yml`'s `workflow_dispatch` trigger (`gh workflow run deploy.yml`, or the Actions tab → Run workflow).
  2. **CloudFront gets a new `*.cloudfront.net` domain** (its domain is AWS-assigned, not something Terraform can pin without a real custom domain) — the frontend's `VITE_API_BASE_URL` on Vercel (`frontend-spec.md` §10) is now stale and must be updated to the new `terraform output api_base_url` value, then redeployed (Vite bakes env vars in at build time, so saving the new value in Vercel's dashboard alone doesn't take effect — trigger a redeploy after changing it).
- **Not handled by this design (acceptable gaps for MVP):** old snapshots are never cleaned up automatically, so storage cost creeps up slowly forever — a "keep last N" step is a reasonable future addition, not required now. `JWT_SECRET` still regenerates on every apply (unlike the DB password) since that's low-stakes — it just logs everyone out, not a data-loss risk. The two manual follow-ups above aren't automated either; scripting them (e.g. `restore.sh` triggering the deploy workflow and/or updating Vercel via its API) is a reasonable next step but wasn't necessary to prove the core backup/restore mechanism works.

### CI/CD (GitHub Actions)
On push to `main`:
1. **Test:** install deps, run backend test suite + lint.
2. **Build:** build the Docker image, tag with the commit SHA.
3. **Push:** push the image to ECR (auth via GitHub OIDC → the IAM deploy role, no static AWS keys as GitHub secrets).
4. **Migrate:** run the Alembic migration as a one-off ECS task against RDS.
5. **Deploy:** update the ECS service/task definition to the new image tag and wait for the rollout to stabilize.

- **CORS:** `CORSMiddleware` configured from `ALLOWED_ORIGINS`, including both the Vercel production domain and its `*.vercel.app` preview domains — Preview deployments hit this same production API (`frontend-spec.md` §10).

## 10. Open Questions
Anthropic and `claude-haiku-4-5-20251001` are selected; specified operational defaults are approved in `AI-spec.md` and §11. Unspecified implementation/release details are tracked in `AI-spec.md` §9. Previously resolved infrastructure decisions:
- First user account: created via `POST /auth/signup` (§5), no seed script needed.
- `Activity.sort_order`: insertion order only, no reorder endpoint/UI.
- JWT expiry: 30 days, no refresh-token flow.
- Terraform remote-state S3 bucket + DynamoDB table: created via a one-time manual setup (AWS Console or a couple of `aws` CLI commands) before the main Terraform config is ever run — not managed as code.
- Single environment (no staging/PR-preview tier) confirmed as sufficient for now.
- Data persistence across `terraform destroy`/`apply` cycles: handled via RDS manual snapshots + a persistent (non-Terraform-managed) master password secret — see Backup & Restore above. Not a database-level backup/DR story beyond that (no point-in-time recovery, no cross-region copies) — out of scope for a personal MVP.

## 11. Conversational AI Integration — Approved Specification

Architecture approved: extend the existing FastAPI deployment with `POST /api/v1/ai/trip-draft`. The model runs at a hosted provider, not inside ECS. See `AI-spec.md` for conversational rules and `api-contract-spec.md` for binding request/response shapes and error mapping. No database migration or changes to trip creation/day generation are required.

### Components & Request Flow

- `app/routers/ai.py`: authenticate, validate the request, enforce the AI rate limit, and delegate to the service.
- `app/schemas/ai.py`: strict Pydantic request/result schemas matching the contract, including field bounds, date ranges, and clarification consistency.
- `app/services/ai_service.py`: own versioned extraction instructions, construct bounded provider context, call the provider asynchronously, and validate structured output. Keep provider-specific calls behind a small replaceable adapter.
- Reuse existing auth dependencies; never forward the Musafir JWT or account data to the provider. Construct system instructions on the server; treat all client history and drafts as untrusted data.
- Accept the frontend's bounded history, latest draft, and fixed reference date/timezone per request. Do not persist messages server-side or add AI session tables; unfinished-flow restoration is browser-local as specified in `frontend-spec.md` §12. No tools that create trips or access saved itineraries are exposed to the model.
- Return validated JSON only. Natural-language ambiguity should produce a clarification with null unresolved fields; malformed provider output produces the documented error. Do not silently coerce unsupported enum values or invalid dates.

### Configuration & Operational Defaults

Approved application settings: `AI_ENABLED` (default false), `AI_PROVIDER` (`anthropic`), `AI_MODEL` (`claude-haiku-4-5-20251001`), `AI_API_KEY`, and `AI_TIMEOUT_SECONDS` (default 20). The selected provider's adapter maps these settings to its API. AI-disabled/unconfigured requests return `503`; existing manual trip creation remains usable and application startup/health checks remain independent of provider availability.

Store the API key in Secrets Manager and inject it into the ECS task using the existing secret pattern. Reference a persistent externally managed provider secret so destroy/restore cycles do not erase it; provision it before enabling AI. Add scoped secret-read permission and task configuration through Terraform. Local development uses ignored `backend/.env`; committed examples contain placeholders only. No key belongs in frontend configuration.

Enforce the request bounds in the API contract. Approved initial rate limit: 10 AI requests per authenticated user per 60 seconds, returning `429` with `Retry-After`. An in-memory limiter is per process and resets on restart; it is only an MVP throttle, not a global spending cap. Review shared enforcement before scaling replicas/workers. The approved Anthropic usage budget is US$5 per month for Musafir, across users and backend instances. Configure and verify spending enforcement before enabling production AI; do not claim the request throttle enforces this budget. If provider controls cannot enforce this amount and scope, document an alternative before release. When the budget blocks AI calls, return `503` using the existing unavailable/quota behavior and preserve manual trip creation.

Allow one provider attempt per request, with a 20-second deadline and SDK automatic retries disabled. Limit each provider response to 1,024 output tokens for the entire structured result, including the conversational reply. Treat a response truncated by the output limit as invalid provider output (`502`); preserve the frontend draft and do not automatically retry. Map failures to `502`/`503`/`504` per the contract; do not expose provider error bodies. Record latency, outcome, and usage counts when available, but do not log raw conversations, prompts, credentials, or auth headers. Raw provider response logging is disabled. Anthropic’s standard API data-handling and retention policy is approved; zero data retention is not required. Verify the applicable policy and account settings before production use; this does not relax the application’s logging and credential-handling restrictions.

### Verification

Add `backend/tests/test_ai.py` using a mocked provider adapter. Cover missing/expired authentication without provider invocation, bounds/schema validation, correction and clarification scenarios, invalid model output, timeout, disabled configuration, rate limiting, and no Trip/Day/Activity writes. CI must not require a live provider key or incur model usage. Keep live extraction evaluation separate, using the cases in `AI-spec.md`.

Implementation/activation notes: `backend/README.md`. Browser timezone aliases are supported via pinned `tzdata`; model behavior is evaluated separately with `python -m scripts.evaluate_ai --run-live` after provider setup.
