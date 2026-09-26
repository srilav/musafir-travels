import re
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+psycopg://musafir:musafir@localhost:5433/musafir"
    JWT_SECRET: str = "change-me-local-dev-secret-at-least-32-bytes"
    JWT_EXPIRY_MINUTES: int = 43200  # 30 days
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    ALLOWED_ORIGIN_REGEX: str = ""

    # Conversational trip creation (backend-spec.md §11)
    AI_ENABLED: bool = False
    AI_PROVIDER: str = "anthropic"
    AI_MODEL: str = "claude-haiku-4-5-20251001"
    AI_API_KEY: str = ""
    AI_TIMEOUT_SECONDS: float = 20.0
    AI_MAX_OUTPUT_TOKENS: int = 1024
    AI_RATE_LIMIT_REQUESTS: int = 10
    AI_RATE_LIMIT_WINDOW_SECONDS: int = 60

    def _origin_entries(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def allowed_origins(self) -> list[str]:
        return [o for o in self._origin_entries() if "*" not in o]

    @property
    def allowed_origin_regex(self) -> str | None:
        """Wildcard entries like https://*.vercel.app match one DNS label (preview deploys)."""
        patterns = [
            re.escape(o).replace(r"\*", "[a-z0-9-]+") for o in self._origin_entries() if "*" in o
        ]
        if self.ALLOWED_ORIGIN_REGEX:
            patterns.append(self.ALLOWED_ORIGIN_REGEX)
        return "|".join(f"(?:{p})" for p in patterns) or None


@lru_cache
def get_settings() -> Settings:
    return Settings()
