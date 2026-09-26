import enum
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TripType(enum.StrEnum):
    solo = "solo"
    couple = "couple"
    family = "family"
    group_of_friends = "group_of_friends"


class Trip(Base):
    __tablename__ = "trips"
    __table_args__ = (CheckConstraint("end_date >= start_date", name="ck_trips_date_range"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    destination: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    trip_type: Mapped[TripType] = mapped_column(Enum(TripType, name="trip_type"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="trips")  # noqa: F821
    days: Mapped[list["Day"]] = relationship(  # noqa: F821
        back_populates="trip",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Day.day_number",
    )
