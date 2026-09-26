"""Unit tests for the AI service: context building, parsing, and the Anthropic adapter."""

import asyncio
from datetime import date

import anthropic
import httpx2
import pytest

from app.config import Settings
from app.schemas.ai import TripDraftRequest
from app.services import ai_service
from app.services.ai_service import (
    AIInvalidOutputError,
    AITimeoutError,
    AIUnavailableError,
    AnthropicProvider,
    ProviderResult,
    build_provider,
    build_provider_messages,
    next_weekend,
    parse_provider_output,
)
from app.services.rate_limit import SlidingWindowRateLimiter


@pytest.mark.parametrize(
    ("reference", "expected"),
    [
        (date(2026, 9, 18), (date(2026, 9, 19), date(2026, 9, 20))),  # Friday
        (date(2026, 9, 19), (date(2026, 9, 19), date(2026, 9, 20))),  # Saturday: today
        (date(2026, 9, 20), (date(2026, 9, 26), date(2026, 9, 27))),  # Sunday: following
        (date(2026, 12, 28), (date(2027, 1, 2), date(2027, 1, 3))),  # crosses year
    ],
)
def test_next_weekend(reference, expected):
    assert next_weekend(reference) == expected


def _request(messages):
    return TripDraftRequest.model_validate(
        {
            "messages": messages,
            "draft": {"destination": None, "start_date": None, "end_date": None, "trip_type": None},
            "reference_date": "2026-09-18",
            "timezone": "UTC",
        }
    )


def test_provider_messages_merge_consecutive_roles_and_start_with_user():
    request = _request(
        [
            {"role": "assistant", "content": "Hi"},
            {"role": "user", "content": "Goa"},
            {"role": "user", "content": "with friends"},
        ]
    )
    assert build_provider_messages(request) == [
        {"role": "user", "content": "(I want to create a trip.)"},
        {"role": "assistant", "content": "Hi"},
        {"role": "user", "content": "Goa\n\nwith friends"},
    ]


def test_parse_rejects_non_end_turn():
    with pytest.raises(AIInvalidOutputError):
        parse_provider_output(ProviderResult(text="{}", stop_reason="refusal"))


def test_build_provider_requires_enabled_and_key():
    assert build_provider(Settings(AI_ENABLED=False, AI_API_KEY="k")) is None
    assert build_provider(Settings(AI_ENABLED=True, AI_API_KEY="")) is None
    assert build_provider(Settings(AI_ENABLED=True, AI_API_KEY="k", AI_PROVIDER="other")) is None
    provider = build_provider(Settings(AI_ENABLED=True, AI_API_KEY="k"))
    assert isinstance(provider, AnthropicProvider)
    assert provider.model == "claude-haiku-4-5-20251001"
    assert provider.max_tokens == 1024
    assert provider._client.max_retries == 0


def test_output_schema_is_strict():
    schema = ai_service.TRIP_DRAFT_OUTPUT_SCHEMA
    assert schema["additionalProperties"] is False
    assert schema["properties"]["draft"]["additionalProperties"] is False


# --- Anthropic adapter error mapping (SDK client mocked) ---------------------------------

_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _status_error(cls, code):
    return cls("boom", response=httpx2.Response(code, request=_REQUEST), body=None)


@pytest.mark.parametrize(
    ("exc", "expected"),
    [
        (anthropic.APITimeoutError(request=_REQUEST), AITimeoutError),
        (anthropic.APIConnectionError(request=_REQUEST), AIUnavailableError),
        (_status_error(anthropic.RateLimitError, 429), AIUnavailableError),
        (_status_error(anthropic.AuthenticationError, 401), AIUnavailableError),
        (_status_error(anthropic.BadRequestError, 400), AIUnavailableError),
        (_status_error(anthropic.InternalServerError, 500), AIUnavailableError),
    ],
)
def test_adapter_maps_sdk_errors(monkeypatch, exc, expected):
    provider = AnthropicProvider("k", "claude-haiku-4-5-20251001", 20, 1024)

    async def fail(**kwargs):
        raise exc

    monkeypatch.setattr(provider._client.messages, "create", fail)
    with pytest.raises(expected) as info:
        asyncio.run(provider.generate(["s"], [{"role": "user", "content": "x"}], {}))
    assert "boom" not in str(info.value)


def test_adapter_enforces_deadline(monkeypatch):
    provider = AnthropicProvider("k", "claude-haiku-4-5-20251001", 0.05, 1024)

    async def slow(**kwargs):
        await asyncio.sleep(1)

    monkeypatch.setattr(provider._client.messages, "create", slow)
    with pytest.raises(AITimeoutError):
        asyncio.run(provider.generate(["s"], [{"role": "user", "content": "x"}], {}))


def test_adapter_sends_expected_request(monkeypatch):
    provider = AnthropicProvider("k", "claude-haiku-4-5-20251001", 20, 1024)
    captured = {}

    class _Block:
        type = "text"
        text = '{"ok": true}'

    class _Usage:
        input_tokens = 10
        output_tokens = 5

    class _Response:
        content = [_Block()]
        stop_reason = "end_turn"
        usage = _Usage()

    async def create(**kwargs):
        captured.update(kwargs)
        return _Response()

    monkeypatch.setattr(provider._client.messages, "create", create)
    result = asyncio.run(
        provider.generate(["a", "b"], [{"role": "user", "content": "x"}], {"s": 1})
    )
    assert result == ProviderResult('{"ok": true}', "end_turn", 10, 5)
    assert captured["model"] == "claude-haiku-4-5-20251001"
    assert captured["max_tokens"] == 1024
    assert captured["system"] == [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}]
    assert captured["output_config"] == {"format": {"type": "json_schema", "schema": {"s": 1}}}


def test_rate_limiter_window():
    now = [0.0]
    limiter = SlidingWindowRateLimiter(2, 60, clock=lambda: now[0])
    assert limiter.hit("u") is None
    assert limiter.hit("u") is None
    now[0] = 15.2
    assert limiter.hit("u") == 45
    assert limiter.hit("v") is None
    now[0] = 60.0
    assert limiter.hit("u") is None
