"""Bot-specific API endpoints.

All routes are protected by a shared secret (X-Bot-Secret header) instead
of user JWT so the Telegram bot process can call them without user tokens.
"""
from __future__ import annotations

import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.db.tasks_session import get_tasks_db
from app.models.task import Tag, Task, TaskDifficulty, TaskStatus, TaskSubscription
from app.models.user import User, UserHistory
from app.schemas.auth import UserOut
from app.schemas.task import TaskOut
from app.api.routes.tasks import _get_task_or_404, _serialize_task, _record_activity

router = APIRouter(prefix="/bot", tags=["bot"])
logger = logging.getLogger(__name__)

CONFIRM_BONUS = 50


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def _require_bot_secret(x_bot_secret: str = Header(...)) -> None:
    if x_bot_secret != settings.telegram_bot_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bot secret",
        )


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class BotStartRequest(BaseModel):
    telegram_chat_id: int
    telegram_username: str  # with leading @


class BotConfirmRequest(BaseModel):
    telegram_chat_id: int
    telegram_username: str


class BotSubscribeRequest(BaseModel):
    telegram_chat_id: int
    telegram_username: str
    tags: List[str] = Field(default_factory=list)
    difficulties: List[str] = Field(default_factory=list)
    min_reward: int = 0


class BotTakeTaskRequest(BaseModel):
    telegram_chat_id: int
    telegram_username: str


class BotStartResponse(BaseModel):
    status: str  # "registered" | "updated" | "not_found"


class BotConfirmResponse(BaseModel):
    status: str  # "confirmed" | "already_confirmed" | "not_found"


class BotSubscribeResponse(BaseModel):
    status: str


class BotSubscriptionsResponse(BaseModel):
    tags: List[str]
    difficulties: List[str]
    min_reward: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lookup_user(db: Session, telegram_username: str) -> Optional[User]:
    handle = telegram_username if telegram_username.startswith("@") else f"@{telegram_username}"
    return db.query(User).filter(User.telegram_username == handle).first()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/start", response_model=BotStartResponse)
def bot_start(
    payload: BotStartRequest,
    _: None = Depends(_require_bot_secret),
    db: Session = Depends(get_db),
) -> BotStartResponse:
    """Called when a user sends /start to the bot. Saves their chat_id."""
    user = _lookup_user(db, payload.telegram_username)
    if user is None:
        return BotStartResponse(status="not_found")

    prev_chat_id = user.telegram_chat_id
    user.telegram_chat_id = payload.telegram_chat_id
    db.commit()
    return BotStartResponse(status="updated" if prev_chat_id else "registered")


@router.post("/confirm-username", response_model=BotConfirmResponse)
def bot_confirm_username(
    payload: BotConfirmRequest,
    _: None = Depends(_require_bot_secret),
    db: Session = Depends(get_db),
) -> BotConfirmResponse:
    """Confirm a user's Telegram username and award 50 points."""
    user = _lookup_user(db, payload.telegram_username)
    if user is None:
        return BotConfirmResponse(status="not_found")

    if user.telegram_confirmed:
        return BotConfirmResponse(status="already_confirmed")

    # Ensure chat_id is stored
    user.telegram_chat_id = payload.telegram_chat_id
    user.telegram_confirmed = True
    user.balance += CONFIRM_BONUS

    history_entry = UserHistory(
        user_id=user.id,
        event_type="username_confirmed",
        message="You confirmed your username",
        balance_delta=CONFIRM_BONUS,
    )
    db.add(history_entry)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Could not confirm username for %s: %s", payload.telegram_username, exc)
        raise HTTPException(status_code=500, detail="Could not confirm username") from exc

    return BotConfirmResponse(status="confirmed")


@router.post("/subscribe", response_model=BotSubscribeResponse)
def bot_subscribe(
    payload: BotSubscribeRequest,
    _: None = Depends(_require_bot_secret),
    db: Session = Depends(get_db),
    tasks_db: Session = Depends(get_tasks_db),
) -> BotSubscribeResponse:
    """Save or update task-tracking subscription for a user."""
    user = _lookup_user(db, payload.telegram_username)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Store chat_id
    if user.telegram_chat_id != payload.telegram_chat_id:
        user.telegram_chat_id = payload.telegram_chat_id
        db.commit()

    cleaned_tags = [t.strip().lower() for t in payload.tags if t.strip()]
    cleaned_diffs = [d.strip().lower() for d in payload.difficulties if d.strip()]

    subscription = tasks_db.query(TaskSubscription).filter(TaskSubscription.user_id == user.id).first()
    if subscription is None:
        subscription = TaskSubscription(user_id=user.id, min_reward=0)
        tasks_db.add(subscription)

    subscription.tags = json.dumps(cleaned_tags)
    subscription.difficulties = json.dumps(cleaned_diffs)
    subscription.min_reward = max(0, int(payload.min_reward))

    try:
        tasks_db.commit()
    except Exception as exc:
        tasks_db.rollback()
        raise HTTPException(status_code=500, detail="Could not save subscription") from exc

    return BotSubscribeResponse(status="ok")


@router.get("/subscriptions/{telegram_username}", response_model=BotSubscriptionsResponse)
def bot_get_subscriptions(
    telegram_username: str,
    _: None = Depends(_require_bot_secret),
    db: Session = Depends(get_db),
    tasks_db: Session = Depends(get_tasks_db),
) -> BotSubscriptionsResponse:
    """Return the current task-tracking subscription for a user."""
    user = _lookup_user(db, telegram_username)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    subscription = tasks_db.query(TaskSubscription).filter(TaskSubscription.user_id == user.id).first()
    if subscription is None:
        return BotSubscriptionsResponse(tags=[], difficulties=[], min_reward=0)

    return BotSubscriptionsResponse(
        tags=json.loads(subscription.tags or "[]"),
        difficulties=json.loads(subscription.difficulties or "[]"),
        min_reward=max(0, int(getattr(subscription, "min_reward", 0) or 0)),
    )


@router.post("/take-task/{task_id}", response_model=TaskOut)
def bot_take_task(
    task_id: int,
    payload: BotTakeTaskRequest,
    _: None = Depends(_require_bot_secret),
    db: Session = Depends(get_db),
    tasks_db: Session = Depends(get_tasks_db),
) -> TaskOut:
    """Take a task on behalf of the Telegram user."""
    user = _lookup_user(db, payload.telegram_username)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found — register on the site first")

    task = _get_task_or_404(tasks_db, task_id)

    if task.creator_id == user.id:
        raise HTTPException(status_code=400, detail="Creators cannot take their own task")

    if task.status != TaskStatus.open:
        raise HTTPException(status_code=400, detail="Only open tasks can be taken")

    creator_username = db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()
    creator_username = creator_username or f"#{task.creator_id}"

    task.status = TaskStatus.in_work
    task.assignee_id = user.id
    _record_activity(
        tasks_db,
        user_id=task.creator_id,
        task=task,
        event_type="task_taken",
        actor_username=user.telegram_username,
    )
    _record_activity(
        tasks_db,
        user_id=user.id,
        task=task,
        event_type="task_taken_by_you",
        actor_username=user.telegram_username,
        other_username=creator_username,
    )

    try:
        tasks_db.commit()
    except Exception as exc:
        tasks_db.rollback()
        raise HTTPException(status_code=500, detail="Could not take task") from exc

    # Notify creator via Telegram if they use the bot
    _notify_creator_task_taken(db, task, user.telegram_username)

    task = _get_task_or_404(tasks_db, task_id)
    creator_username = db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()
    return _serialize_task(task, creator_telegram_username=creator_username)


def _notify_creator_task_taken(db: Session, task: Task, taker_username: str) -> None:
    """Send a Telegram notification to the task creator if they use the bot."""
    try:
        from app.core.telegram_notify import inline_keyboard, send_message, url_button

        creator = db.query(User).filter(User.id == task.creator_id).first()
        if creator is None or not creator.telegram_chat_id:
            return

        task_title = task.title or f"Task #{task.id}"
        text = (
            f"🔔 <b>Your task is now in work!</b>\n\n"
            f"📋 <b>{task_title}</b>\n"
            f"👤 Accepted by: {taker_username}\n\n"
            f"Check the site for details."
        )
        markup = inline_keyboard([[url_button("🌐 View on site", settings.site_url)]])
        send_message(creator.telegram_chat_id, text, reply_markup=markup)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to notify creator of task taken: %s", exc)
