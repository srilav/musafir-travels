"""Strict schemas for POST /ai/trip-draft (api-contract-spec.md §5, AI Draft Schemas)."""

import re
from datetime import date
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator

from app.models import TripType

MAX_MESSAGES_PER_REQUEST = 19  # the 20th conversation slot is reserved for the reply
MAX_MESSAGE_CHARS = 2000
MAX_TOTAL_MESSAGE_CHARS = 12000
MAX_DESTINATION_CHARS = 300
MAX_TIMEZONE_CHARS = 100

DraftField = Literal["destination", "start_date", "end_date", "trip_type"]
DRAFT_FIELDS: tuple[str, ...] = ("destination", "start_date", "end_date", "trip_type")

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _strict_iso_date(value: object) -> object:
    """Accept only YYYY-MM-DD strings that are real calendar dates (or date objects)."""
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not _ISO_DATE.match(value):
        raise ValueError("must be a date string in YYYY-MM-DD format")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("must be a valid calendar date") from None


StrictDate = Annotated[date, BeforeValidator(_strict_iso_date)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChatMessage(_Strict):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_MESSAGE_CHARS)

    @field_validator("content")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content must not be blank")
        return value


class TripDraft(_Strict):
    destination: str | None
    start_date: StrictDate | None
    end_date: StrictDate | None
    trip_type: TripType | None

    @field_validator("destination")
    @classmethod
    def _check_destination(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("destination must not be blank")
        if len(value) > MAX_DESTINATION_CHARS:
            raise ValueError(f"destination must be at most {MAX_DESTINATION_CHARS} characters")
        return value

    @model_validator(mode="after")
    def _check_range(self) -> "TripDraft":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self

    def null_fields(self) -> set[str]:
        return {name for name in DRAFT_FIELDS if getattr(self, name) is None}


class TripDraftRequest(_Strict):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES_PER_REQUEST)
    draft: TripDraft
    reference_date: StrictDate
    timezone: str = Field(min_length=1, max_length=MAX_TIMEZONE_CHARS)

    @field_validator("timezone")
    @classmethod
    def _valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("timezone must be a valid IANA timezone identifier") from None
        return value

    @model_validator(mode="after")
    def _check_messages(self) -> "TripDraftRequest":
        total = sum(len(m.content) for m in self.messages)
        if total > MAX_TOTAL_MESSAGE_CHARS:
            raise ValueError(
                f"messages may contain at most {MAX_TOTAL_MESSAGE_CHARS} characters in total"
            )
        if self.messages[-1].role != "user":
            raise ValueError("the last message must have role 'user'")
        return self


class TripDraftResponse(_Strict):
    draft: TripDraft
    missing_fields: list[DraftField]
    clarification_fields: list[DraftField]
    reply: str = Field(max_length=MAX_MESSAGE_CHARS)

    @field_validator("reply")
    @classmethod
    def _reply_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("reply must not be blank")
        return value

    @model_validator(mode="after")
    def _check_field_lists(self) -> "TripDraftResponse":
        missing, unclear = set(self.missing_fields), set(self.clarification_fields)
        if len(missing) != len(self.missing_fields) or len(unclear) != len(
            self.clarification_fields
        ):
            raise ValueError("field lists must not contain duplicates")
        if missing & unclear:
            raise ValueError("missing_fields and clarification_fields must be disjoint")
        if missing | unclear != self.draft.null_fields():
            raise ValueError("field lists must cover exactly the null draft fields")
        return self
