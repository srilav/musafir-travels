# Musafir Travels

Trip planner web app with conversational (AI-assisted) trip creation, built from the specs in
`specs_with_AI_feature/` (`specs/` is the MVP baseline).

| Path | What |
|---|---|
| `backend/` | FastAPI API, Alembic migrations, tests, live AI evaluation script — see `backend/README.md` |
| `frontend/` | React + Vite SPA (Vercel) — see `frontend/README.md` |
| `infra/` | Terraform for AWS (ECS Fargate, RDS, ALB, CloudFront) + backup/restore scripts — see `infra/README.md` |
| `.github/workflows/` | Backend CI, frontend CI, deploy to ECS |
| `docker-compose.yml` | Local Postgres (:5433) and API (:8000) |

Quick start:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
docker compose up --build          # Postgres + migrations + API on http://localhost:8000
cd frontend && npm ci && npm run dev
```

AI is off by default (`AI_ENABLED=false`); the chat shows a fallback to manual entry until it is
activated per `backend/README.md`.
