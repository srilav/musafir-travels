import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import activities, ai, auth, days, trips

logging.basicConfig(level=logging.INFO)

settings = get_settings()

app = FastAPI(title="Musafir Travels API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.allowed_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)

API_PREFIX = "/api/v1"
for module in (auth, trips, days, activities, ai):
    app.include_router(module.router, prefix=API_PREFIX)


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    # Independent of the database and the AI provider (backend-spec.md §11).
    return {"status": "ok"}
