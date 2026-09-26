from datetime import UTC, datetime
from typing import Annotated

from pydantic import PlainSerializer


def _format_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


# Timestamps are serialized as YYYY-MM-DDTHH:MM:SSZ (api-contract-spec.md §1).
UTCDateTime = Annotated[datetime, PlainSerializer(_format_utc, return_type=str)]
