import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Day(Base):
    __tablename__ = "days"
    __table_args__ = (UniqueConstraint("trip_id", "day_number", name="uq_days_trip_day_number"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)

    trip: Mapped["Trip"] = relationship(back_populates="days")  # noqa: F821
    activities: Mapped[list["Activity"]] = relationship(  # noqa: F821
        back_populates="day",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="(Activity.sort_order, Activity.created_at)",
    )
