import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import TripType
from app.schemas.common import UTCDateTime


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    text: str
    sort_order: int
    created_at: UTCDateTime


class DayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    day_number: int
    date: date
    activities: list[ActivityOut]


class TripSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    destination: str
    start_date: date
    end_date: date
    trip_type: TripType
    created_at: UTCDateTime


class TripOut(TripSummary):
    days: list[DayOut]


class CreateTripRequest(BaseModel):
    destination: str = Field(min_length=1)
    start_date: date
    end_date: date
    trip_type: TripType

    @field_validator("destination", mode="before")
    @classmethod
    def _strip_destination(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class ActivityTextRequest(BaseModel):
    # Emptiness is a business rule (400), checked in the service.
    text: str
