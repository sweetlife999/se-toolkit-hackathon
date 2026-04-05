from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.tasks_session import get_tasks_db
from app.db.session import get_db
from app.models.task import Task, TaskStatus
from app.models.user import User, UserHistory
from app.schemas.auth import Token, UserHistoryOut, UserOut, UserRegister


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> User:
    try:
        user = User(
            telegram_username=payload.telegram_username,
            hashed_password=get_password_hash(payload.password),
            balance=0,
        )

        db.add(user)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Telegram username is already registered") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create user") from exc

    return user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> Token:
    user = db.query(User).filter(User.telegram_username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    token = create_access_token(subject=user.telegram_username)
    return Token(access_token=token, token_type="bearer")


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user), tasks_db: Session = Depends(get_tasks_db)) -> UserOut:
    tasks_created = tasks_db.query(Task).filter(Task.creator_id == current_user.id).count()
    tasks_finished = (
        tasks_db.query(Task)
        .filter(Task.creator_id == current_user.id, Task.status == TaskStatus.done)
        .count()
    )

    return UserOut(
        id=current_user.id,
        telegram_username=current_user.telegram_username,
        balance=current_user.balance,
        tasks_created=tasks_created,
        tasks_finished=tasks_finished,
    )


@router.get("/history", response_model=list[UserHistoryOut])
def user_history(
    limit: int = 200,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserHistoryOut]:
    return (
        db.query(UserHistory)
        .filter(UserHistory.user_id == current_user.id)
        .order_by(UserHistory.created_at.desc(), UserHistory.id.desc())
        .limit(max(1, min(limit, 500)))
        .all()
    )

