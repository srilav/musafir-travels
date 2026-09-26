import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.trips import ActivityOut, ActivityTextRequest
from app.security import get_current_user
from app.services import trip_service

router = APIRouter(prefix="/trips/{trip_id}/days/{day_id}", tags=["days"])


@router.post("/activities", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
def add_activity(
    trip_id: uuid.UUID,
    day_id: uuid.UUID,
    body: ActivityTextRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return trip_service.add_activity(db, user, trip_id, day_id, body.text)
