from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings, get_settings
from app.db import SessionLocal
from app.models import User
from app.schemas.ai import TripDraftRequest, TripDraftResponse
from app.security import get_current_user
from app.services import ai_service
from app.services.knowledge_service import KnowledgeRetriever
from app.services.rate_limit import SlidingWindowRateLimiter

router = APIRouter(prefix="/ai", tags=["ai"])


@lru_cache
def get_rate_limiter() -> SlidingWindowRateLimiter:
    settings = get_settings()
    return SlidingWindowRateLimiter(
        settings.AI_RATE_LIMIT_REQUESTS, settings.AI_RATE_LIMIT_WINDOW_SECONDS
    )


@lru_cache
def get_knowledge_retriever() -> KnowledgeRetriever:
    return KnowledgeRetriever(SessionLocal)


def get_ai_provider(
    settings: Settings = Depends(get_settings),
) -> ai_service.TripDraftProvider | None:
    return ai_service.build_provider(settings)


@router.post("/trip-draft", response_model=TripDraftResponse)
async def create_trip_draft(
    body: TripDraftRequest,
    user: User = Depends(get_current_user),
    provider: ai_service.TripDraftProvider | None = Depends(get_ai_provider),
    limiter: SlidingWindowRateLimiter = Depends(get_rate_limiter),
    retriever: KnowledgeRetriever = Depends(get_knowledge_retriever),
) -> TripDraftResponse:
    """Extract or clarify trip details. Stateless: never writes trips, days or activities."""
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI trip drafting is not available. Please enter your trip details manually.",
        )
    retry_after = limiter.hit(str(user.id))
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many AI requests. Please wait before trying again.",
            headers={"Retry-After": str(retry_after)},
        )
    try:
        return await ai_service.generate_trip_draft(body, provider, retriever)
    except ai_service.AITimeoutError as exc:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from None
    except ai_service.AIInvalidOutputError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from None
    except ai_service.AIUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from None
