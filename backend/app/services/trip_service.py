import uuid
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Activity, Day, Trip, User
from app.schemas.trips import CreateTripRequest


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _clean_text(text: str) -> str:
    cleaned = text.strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="text must not be empty"
        )
    return cleaned


def list_trips(db: Session, user: User) -> list[Trip]:
    stmt = select(Trip).where(Trip.user_id == user.id).order_by(Trip.created_at.desc())
    return list(db.scalars(stmt))


def get_trip(db: Session, user: User, trip_id: uuid.UUID) -> Trip:
    stmt = (
        select(Trip)
        .where(Trip.id == trip_id, Trip.user_id == user.id)
        .options(selectinload(Trip.days).selectinload(Day.activities))
    )
    trip = db.scalars(stmt).first()
    if trip is None:
        raise _not_found("Trip not found")
    return trip


def create_trip(db: Session, user: User, data: CreateTripRequest) -> Trip:
    if data.end_date < data.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date",
        )
    trip = Trip(
        user_id=user.id,
        destination=data.destination,
        start_date=data.start_date,
        end_date=data.end_date,
        trip_type=data.trip_type,
    )
    n_days = (data.end_date - data.start_date).days + 1
    trip.days = [
        Day(day_number=i + 1, date=data.start_date + timedelta(days=i)) for i in range(n_days)
    ]
    db.add(trip)
    db.commit()
    return get_trip(db, user, trip.id)


def delete_trip(db: Session, user: User, trip_id: uuid.UUID) -> None:
    trip = get_trip(db, user, trip_id)
    db.delete(trip)
    db.commit()


def add_activity(
    db: Session, user: User, trip_id: uuid.UUID, day_id: uuid.UUID, text: str
) -> Activity:
    stmt = (
        select(Day)
        .join(Trip)
        .where(Day.id == day_id, Day.trip_id == trip_id, Trip.user_id == user.id)
    )
    day = db.scalars(stmt).first()
    if day is None:
        raise _not_found("Day not found")
    cleaned = _clean_text(text)
    max_order = db.scalar(select(func.max(Activity.sort_order)).where(Activity.day_id == day.id))
    activity = Activity(
        day_id=day.id, text=cleaned, sort_order=0 if max_order is None else max_order + 1
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


def _get_owned_activity(db: Session, user: User, activity_id: uuid.UUID) -> Activity:
    stmt = (
        select(Activity)
        .join(Day)
        .join(Trip)
        .where(Activity.id == activity_id, Trip.user_id == user.id)
    )
    activity = db.scalars(stmt).first()
    if activity is None:
        raise _not_found("Activity not found")
    return activity


def update_activity(db: Session, user: User, activity_id: uuid.UUID, text: str) -> Activity:
    activity = _get_owned_activity(db, user, activity_id)
    activity.text = _clean_text(text)
    db.commit()
    db.refresh(activity)
    return activity


def delete_activity(db: Session, user: User, activity_id: uuid.UUID) -> None:
    activity = _get_owned_activity(db, user, activity_id)
    db.delete(activity)
    db.commit()
