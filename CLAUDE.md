# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this folder is

This is a **specs and reference workspace** for Musafir Travels, a trip planner web app. It holds no application code. The code lives in `github.com/srilav/musafir-travels`: `main` has the MVP, and the `codex-ai-feature` branch adds conversational trip creation.

- `specs/`: the MVP specs (goal, backend, frontend, api-contract).
- `specs_with_AI_feature/`: the same four specs plus the AI feature, and a fifth file, `AI-spec.md`. **This is the current set of specs.** Keep `specs/` as the MVP baseline and don't update it for AI work.
- `*.html`: exported build transcripts (Claude Code and Codex sessions, and deployment part 2). They're large, so use grep instead of reading them whole. They record the reasoning behind decisions and past QA fixes.

## How the specs fit together

- `goal-spec.md` §9 Glossary defines the domain terms (Trip, Destination, Trip Type, Itinerary, Day, Activity) that every other spec uses.
- `api-contract-spec.md` is the **binding contract** between frontend and backend. If another spec disagrees with it, the contract wins; fix the other spec.
- `AI-spec.md` §2 decides which spec owns each part of the AI feature. Put each change in the spec that owns it and cross-reference it from the others instead of repeating it:
  - `AI-spec.md`: extraction and conversation rules, evaluation
  - `frontend-spec.md` §12: chat UI and draft restoration
  - `api-contract-spec.md`: `POST /ai/trip-draft` and its schemas
  - `backend-spec.md` §11: router/service, `AI_*` config, rate limits
- Specs refer to each other by section number (for example "`backend-spec.md` §5"). When you renumber or move a section, update those references.
- Decisions that were approved are listed in each spec's "Open Questions" / "Approved Decisions" section. Don't reopen them unless asked.

## Rules that apply across specs

- Days are generated only by the server when a trip is created: N = end − start + 1. The client never creates Days.
- JSON fields use `snake_case` with no aliasing. Dates are `YYYY-MM-DD`. Errors use FastAPI's `{"detail": ...}` shape.
- If a resource belongs to another user, the API returns `404`, never `403`.
- `TripType` is one of `solo` / `couple` / `family` / `group_of_friends`.
- The AI endpoint creates a draft only. It never writes Trips; the frontend creates the trip through the unchanged `POST /trips` after the user explicitly confirms.
- The AI model is pinned to `claude-haiku-4-5-20251001` with the Anthropic Python SDK `1.6.0`. Don't change either without an architect decision.

## Stack (code repo)

- **Backend:** FastAPI, SQLAlchemy 2 + Alembic, PostgreSQL. Deployed with Terraform to AWS: ECS Fargate behind an ALB and CloudFront, with RDS for the database. CI/CD is GitHub Actions deploying through OIDC.
- **Frontend:** React, TypeScript, Vite, Tailwind, React Query. Hosted on Vercel.
- **Cost:** the AWS stack is billed hourly (NAT Gateway, ALB). Run `terraform destroy` after each working session.

## Commands (run in the code repo, not here)

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local` first.

- Repo root: `docker compose up --build` starts Postgres on port 5433 and the API on port 8000, and runs migrations.
- `backend/` (Python 3.12 venv):
  - `pip install -r requirements-dev.txt`
  - `uvicorn app.main:app --reload`
  - `alembic upgrade head`
  - `ruff check .`
  - `pytest -q`
  - Single test: `pytest tests/test_ai.py::<test_name> -q`
  - Tests need Postgres (default `TEST_DATABASE_URL`: `postgresql+psycopg://musafir:musafir@localhost:5433/musafir_test`).
  - `python -m scripts.evaluate_ai --run-live` makes **paid** Anthropic calls. It's opt-in and never part of the test suite.
- `frontend/`:
  - `npm ci`
  - `npm run dev`
  - `npm run lint`
  - `npm test` (vitest)
  - `npm run build` (type-checks as well as building)
  - Single test file: `npx vitest run <path>`
