import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.trips import ActivityOut, ActivityTextRequest
from app.security import get_current_user
from app.services import trip_service

router = APIRouter(prefix="/activities", tags=["activities"])


@router.patch("/{activity_id}", response_model=ActivityOut)
def update_activity(
    activity_id: uuid.UUID,
    body: ActivityTextRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return trip_service.update_activity(db, user, activity_id, body.text)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    trip_service.delete_activity(db, user, activity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
