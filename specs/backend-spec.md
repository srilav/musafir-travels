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
- Hosting: AWS ECS Fargate (containerized API) behind an Application Load Balancer, database on AWS RDS for PostgreSQL
- Infrastructure as code: Terraform (VPC, RDS, ECS cluster/service/task definition, ALB, ECR repo, IAM roles)
- CI/CD: GitHub Actions (test → build/push Docker image to ECR → deploy to ECS on merge to `main`)

## 2. Architecture Overview
<!-- Monolith vs. services, request flow, key layers (controllers/services/repositories), any background jobs or queues. -->
Single monolithic FastAPI app (no microservices, no background jobs/queues — nothing in scope needs async processing). Layers:
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
- **Trip creation:** `end_date` must be ≥ `start_date` (400 if not). On success, the service computes N = (`end_date` − `start_date`).days + 1 and creates N `Day` rows (`day_number` 1..N, `date` = `start_date` + offset) in the same transaction as the Trip — the client never creates/deletes Days directly.
- **Activity text:** required, trimmed, rejects empty/whitespace-only strings (400).
- **Ownership:** every Trip/Day/Activity operation checks the resource belongs to the authenticated user (`Trip.user_id == current_user.id`, transitively for its Days/Activities). A resource that exists but belongs to another user returns `404` (not `403`) to avoid confirming it exists.
- **No overlapping-trip validation:** a user may have multiple trips with overlapping dates — out of scope per `goal-spec.md`.
- **No auto-suggested activities/plans:** explicitly out of scope per `goal-spec.md`.

## 5. Authentication & Authorization
<!-- Auth strategy (JWT/session/OAuth), password handling, role/permission model, who can access/modify what. -->
- **Strategy:** JWT bearer tokens, matching the frontend's `Authorization: Bearer <token>` expectation (`frontend-spec.md` §5/§8).
- **Login:** `POST /auth/login` verifies username + password (bcrypt) and returns a signed JWT (`JWT_SECRET`, expiry 30 days — no refresh-token flow for MVP; re-login once it expires).
- **Signup:** `POST /auth/signup` creates a new account (username + bcrypt-hashed password) and returns a token in the same shape as login, so the client is immediately logged in. `username` must be unique (`400` if taken, consistent with other business-rule validation — no `403`/`409` in this API's status-code set, see §8). This is basic username/password signup only — email-based auth/password reset is still deferred to post-MVP per `goal-spec.md`.
- **Authorization:** every route except `/auth/login` requires a valid JWT (FastAPI dependency); the authenticated `user_id` scopes all Trip/Day/Activity queries. No roles/permission tiers — a user can only ever see/modify their own data.
- An expired/invalid/missing token returns `401`.
## 6. Third-Party Integrations
<!-- Maps, geocoding, weather, flight/hotel data, email, etc. Include what each is used for. -->
- None for MVP. No maps/geocoding/weather/email — auto-suggestions and richer itinerary data are explicitly out of scope per `goal-spec.md`. PDF export is generated client-side (`frontend-spec.md`), so the backend has no PDF-related endpoint or dependency either.

## 7. Non-Functional Requirements
<!-- Performance/scalability targets, rate limiting, caching strategy, logging/monitoring, expected load. -->
- Expected load: a single user or a small handful of personal accounts (MVP, no public signup) — no performance/scalability targets beyond "feels instant" for this scale, even though the AWS setup has headroom to scale further later.
- Rate limiting: not needed at this scale/threat model.
- Caching: none — Postgres queries at this scale don't need a cache layer.
- Logging: Uvicorn's default access/error logs are sufficient; no external monitoring/APM for MVP.

## 8. Error Handling
<!-- Standard error response shape, how validation errors vs. server errors vs. auth errors are surfaced. (Should match api-contract-spec.md) -->
- Uses FastAPI's default conventions: `HTTPException` → `{"detail": "<message>"}`; Pydantic validation failures → `422` with FastAPI's standard `detail` array of field errors.
- Status codes: `400` business-rule validation (e.g. `end_date` before `start_date`, empty activity text), `401` missing/invalid/expired JWT, `404` resource not found or not owned by the caller, `422` request-shape validation, `500` unhandled error.
- This is the MVP default — **must be finalized to match `api-contract-spec.md`** once that spec is filled in, since the exact response envelope is the frontend/backend contract.
## 9. Environment & Deployment
<!-- Env vars, config management, deployment target, migrations strategy. -->
- **Env vars/secrets:** `DATABASE_URL` (RDS connection string), `JWT_SECRET`, `JWT_EXPIRY_MINUTES`, `ALLOWED_ORIGINS` (comma-separated, for CORS). Stored as ECS task definition secrets sourced from AWS Secrets Manager (not plain environment variables) for `DATABASE_URL`/`JWT_SECRET`; non-secret config (`ALLOWED_ORIGINS`, `JWT_EXPIRY_MINUTES`) as plain task-definition env vars.
- **Migrations:** Alembic; run as a one-off ECS task (`alembic upgrade head`) triggered by the deploy pipeline before the new app version receives traffic.
- **Seeding:** none needed — accounts are created via `POST /auth/signup` (§5).

### Infrastructure (Terraform)
- **VPC:** private subnets for ECS tasks and RDS, routed to the internet via a **NAT Gateway**; public subnets for the ALB and the NAT Gateway itself. RDS is not publicly accessible — only reachable from the ECS tasks' security group. Standard "production-shaped" network isolation — reconsidered and kept (see cost note below) rather than the leaner public-subnet-for-ECS alternative, since AWS bills these hourly and this project's usage pattern is short/bursty, not always-on.
- **RDS:** PostgreSQL instance (smallest instance class appropriate for this scale, e.g. `db.t4g.micro` — free-tier eligible for a new AWS account's first 12 months), automated backups enabled.
- **ECR:** one repository for the backend's Docker image.
- **ECS:** Fargate cluster, one service running the FastAPI container in the private subnets, task definition referencing the ECR image + env vars/secrets above.
- **ALB:** routes HTTPS traffic to the ECS service's target group; ACM cert for the API's domain. Gives a stable DNS name (Fargate task IPs change on every redeploy) plus health-checked rolling deploys.
- **IAM:** a task execution role (pull from ECR, read Secrets Manager) and a narrowly-scoped deploy role for GitHub Actions (via OIDC — no long-lived AWS access keys stored in GitHub).
- Terraform state stored remotely (e.g. an S3 backend with DynamoDB locking) rather than locally, so it isn't tied to one machine.
- **Cost note:** NAT Gateway (~$0.045/hr) and ALB (~$0.0225/hr) are billed **hourly**, not as flat monthly fees — the widely-quoted "~$33/month" and "~$17/month" figures assume the stack runs continuously for a full month. Since this app is only expected to be used for a few hours at a time, actual cost for a usage session is a few dozen cents, not tens of dollars. **Run `terraform destroy` after each session** (or whenever the app isn't actively being used) to avoid accumulating the full monthly rate — this setup is meant to be spun up and torn down, not left running.

### CI/CD (GitHub Actions)
On push to `main`:
1. **Test:** install deps, run backend test suite + lint.
2. **Build:** build the Docker image, tag with the commit SHA.
3. **Push:** push the image to ECR (auth via GitHub OIDC → the IAM deploy role, no static AWS keys as GitHub secrets).
4. **Migrate:** run the Alembic migration as a one-off ECS task against RDS.
5. **Deploy:** update the ECS service/task definition to the new image tag and wait for the rollout to stabilize.

- **CORS:** `CORSMiddleware` configured from `ALLOWED_ORIGINS`, including both the Vercel production domain and its `*.vercel.app` preview domains — Preview deployments hit this same production API (`frontend-spec.md` §10).

## 10. Open Questions
_None currently — all resolved:_
- First user account: created via `POST /auth/signup` (§5), no seed script needed.
- `Activity.sort_order`: insertion order only, no reorder endpoint/UI.
- JWT expiry: 30 days, no refresh-token flow.
- Terraform remote-state S3 bucket + DynamoDB table: created via a one-time manual setup (AWS Console or a couple of `aws` CLI commands) before the main Terraform config is ever run — not managed as code.
- Single environment (no staging/PR-preview tier) confirmed as sufficient for now.
