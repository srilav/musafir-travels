# Musafir Travels API

FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL. Implements `specs_with_AI_feature/api-contract-spec.md`
under `/api/v1`, plus a public `GET /health`.

## Local setup

```bash
cp .env.example .env                   # from backend/
docker compose up -d db                # from the repo root: Postgres on :5433 (+ musafir_test db)
uv venv -p 3.12 .venv                  # or python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/alembic upgrade head
.venv/bin/python -m scripts.load_knowledge   # AI reference notes (idempotent)
.venv/bin/uvicorn app.main:app --reload
```

Or run everything in Docker from the repo root: `docker compose up --build` (runs migrations, API on :8000).

## Checks

```bash
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/pytest -q                                   # needs Postgres on :5433
.venv/bin/pytest tests/test_ai.py::test_rate_limit_per_user -q
```

Tests use `TEST_DATABASE_URL` (default `postgresql+psycopg://musafir:musafir@localhost:5433/musafir_test`).
The AI tests use a mocked provider adapter: no API key is needed and no model usage is incurred.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | local compose DB | Secret in ECS |
| `JWT_SECRET` | dev value | Secret in ECS; use ≥32 random bytes |
| `JWT_EXPIRY_MINUTES` | `43200` | 30 days |
| `ALLOWED_ORIGINS` | localhost:5173 | Comma-separated. `*` matches one DNS label, e.g. `https://*.vercel.app` |
| `ALLOWED_ORIGIN_REGEX` | empty | Optional extra origin regex |
| `AI_ENABLED` | `false` | AI endpoint returns `503` unless `true` **and** a key is set |
| `AI_PROVIDER` | `anthropic` | Only supported provider |
| `AI_MODEL` | `claude-haiku-4-5-20251001` | Pinned; change only with an architect decision |
| `AI_API_KEY` | empty | Secret in ECS (`musafir/anthropic-api-key-persistent`); never in the frontend |
| `AI_TIMEOUT_SECONDS` | `20` | One attempt, SDK retries disabled |

Fixed by code: 1,024 max output tokens, 10 AI requests per user per 60 s (in-memory, per process).

## Conversational trip drafting (`POST /api/v1/ai/trip-draft`)

- `app/schemas/ai.py`: strict request/response schemas (unknown keys rejected, strict `YYYY-MM-DD`
  dates, IANA timezone, 1–19 messages, 2,000 chars/message, 12,000 chars total, last message from
  the user, field-list consistency on the result).
- `app/services/ai_service.py`: versioned instructions (`PROMPT_VERSION`), per-request context
  (reference date + weekday, timezone, precomputed "next weekend", current draft as baseline),
  the Anthropic adapter (structured JSON output, 20 s deadline, no retries), and output validation.
- `app/routers/ai.py`: auth → request validation → enabled check → rate limit → provider.

Error mapping: `401` auth, `422` invalid/oversized request, `429` rate limit (with `Retry-After`),
`502` invalid or truncated model output, `503` disabled/unconfigured/provider unavailable or over
quota, `504` provider timeout. Provider error bodies, prompts and conversations are never returned
or logged; only prompt version, outcome, latency, stop reason and token counts are logged.

The endpoint never writes trips. The frontend creates the trip through the unchanged
`POST /api/v1/trips` after the user confirms.

### Activation checklist (AI-spec.md §9)

1. Create the Anthropic key secret (raw key as plaintext) — see `infra/README.md`.
2. Configure and verify the **US$5/month** spend limit for the Anthropic workspace/key used by
   Musafir. The per-process rate limiter is not a spending cap. Blocked usage surfaces as `503`
   and manual trip entry keeps working.
3. Verify the account uses Anthropic's standard API data-handling policy.
4. Optionally run the live evaluation (paid):
   `AI_API_KEY=sk-ant-... .venv/bin/python -m scripts.evaluate_ai --run-live`
   (`--case NAME` to run one case). Cases mirror `AI-spec.md` §7.
5. Set `ai_enabled = true` in Terraform, apply, then run the deploy workflow.

### Reference knowledge (RAG)

Before each model call the backend looks up curated notes and adds them as a third system block
(`# REFERENCE NOTES`): festival/holiday dates with nearby weekends, alternative place names, and
Hinglish phrase meanings. See `AI-spec.md` §4 and `backend-spec.md` §11.

- Data: `app/knowledge/holidays.json`, `destinations.json`, `phrases.json`. Weekdays and
  weekend notes are computed by `app/services/knowledge_loader.py`.
- Load: `python -m scripts.load_knowledge` (replaces everything; Docker Compose and the deploy
  migration task run it after `alembic upgrade head`).
- Search: PostgreSQL `pg_trgm` `strict_word_similarity` (threshold 0.6, up to 6 notes, 500 ms
  timeout). No embeddings. Failures fall back to "no notes".
- **Adding a year of festival dates:** copy the dates from the published DoPT gazetted-holiday
  list, set `source`, mark moon-sighting festivals `"tentative": true`, reload, and add a case to
  `scripts/evaluate_ai.py`. Never add dates that were not checked against the list.

Known MVP limitation: the rate limiter is per process and resets on restart; review shared
enforcement before scaling to multiple tasks/workers.
