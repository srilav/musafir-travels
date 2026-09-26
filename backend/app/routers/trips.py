import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.trips import CreateTripRequest, TripOut, TripSummary
from app.security import get_current_user
from app.services import trip_service

router = APIRouter(prefix="/trips", tags=["trips"])


@router.get("", response_model=list[TripSummary])
def list_trips(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return trip_service.list_trips(db, user)


@router.post("", response_model=TripOut, status_code=status.HTTP_201_CREATED)
def create_trip(
    body: CreateTripRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return trip_service.create_trip(db, user, body)


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(
    trip_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return trip_service.get_trip(db, user, trip_id)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    trip_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    trip_service.delete_trip(db, user, trip_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
