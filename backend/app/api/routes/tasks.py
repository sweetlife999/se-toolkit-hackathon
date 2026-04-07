from __future__ import annotations

import json
import logging
from typing import Dict, Iterable, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.db.tasks_session import get_tasks_db
from app.models.task import Tag, Task, TaskActivity, TaskMode, TaskStatus, TaskSubscription
from app.models.user import User
from app.schemas.task import TaskActivityOut, TaskCreate, TaskOut, TaskTrackingSettingsOut, TaskTrackingSettingsUpdate

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/tasks", tags=["tasks"])


def _normalize_tags(raw_tags: Iterable[str]) -> List[str]:
    normalized: List[str] = []
    seen: Set[str] = set()

    for raw_tag in raw_tags:
        for part in raw_tag.split(","):
            tag = part.strip().lower()
            if not tag or tag in seen:
                continue
            seen.add(tag)
            normalized.append(tag)

    return normalized


def _task_query(db: Session):
    return db.query(Task).options(selectinload(Task.tags))


def _get_task_or_404(db: Session, task_id: int) -> Task:
    task = _task_query(db).filter(Task.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def _ensure_tag(db: Session, tag_name: str) -> Tag:
    tag = db.query(Tag).filter(func.lower(Tag.name) == tag_name.lower()).first()
    if tag is not None:
        return tag

    tag = Tag(name=tag_name)
    db.add(tag)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        tag = db.query(Tag).filter(func.lower(Tag.name) == tag_name.lower()).first()
        if tag is None:
            raise HTTPException(status_code=500, detail="Could not create tag") from exc
    return tag


def _user_username_map(auth_db: Session, user_ids: Iterable[Optional[int]]) -> Dict[int, str]:
    unique_user_ids = {user_id for user_id in user_ids if user_id is not None}
    if not unique_user_ids:
        return {}

    rows = auth_db.query(User.id, User.telegram_username).filter(User.id.in_(unique_user_ids)).all()
    return {user_id: telegram_username for user_id, telegram_username in rows}


def _serialize_task(
    task: Task,
    creator_telegram_username: Optional[str] = None,
    assignee_telegram_username: Optional[str] = None,
) -> TaskOut:
    task_out = TaskOut.model_validate(task)
    return task_out.model_copy(
        update={
            "creator_telegram_username": creator_telegram_username,
            "assignee_telegram_username": assignee_telegram_username,
        }
    )


def _creator_username_map(auth_db: Session, creator_ids: Iterable[int]) -> Dict[int, str]:
    unique_creator_ids = {creator_id for creator_id in creator_ids}
    if not unique_creator_ids:
        return {}

    rows = auth_db.query(User.id, User.telegram_username).filter(User.id.in_(unique_creator_ids)).all()
    return {user_id: telegram_username for user_id, telegram_username in rows}


def _get_auth_user_or_404(auth_db: Session, user_id: int) -> User:
    user = auth_db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _record_activity(
    db: Session,
    *,
    user_id: int,
    task: Task,
    event_type: str,
    actor_username: str,
    other_username: Optional[str] = None,
    balance_delta: int = 0,
) -> None:
    db.add(
        TaskActivity(
            user_id=user_id,
            task_id=task.id,
            event_type=event_type,
            task_title=(task.title or f"Task #{task.id}"),
            actor_username=actor_username,
            other_username=other_username,
            balance_delta=balance_delta,
        )
    )


def _format_estimated_hours_label(estimated_minutes: int) -> str:
    minutes = max(0, int(estimated_minutes or 0))
    if minutes == 0:
        return "-"

    hours = minutes / 60
    if float(hours).is_integer():
        return f"{int(hours)} h"
    return f"{hours:.1f} h"


def _history_event_types_for_category(category: str) -> List[str]:
    category_map = {
        "all": [],
        "created": ["task_created"],
        "taken": ["task_taken", "task_taken_by_you", "task_released"],
        "completed": ["task_completed", "task_completion_confirmed"],
        "cancelled": ["task_cancelled"],
    }

    if category not in category_map:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown history category")

    return category_map[category]


def _safe_json_string_list(raw_value: Optional[str]) -> List[str]:
    if not raw_value:
        return []

    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError:
        return []

    if not isinstance(parsed, list):
        return []

    normalized: List[str] = []
    for item in parsed:
        if isinstance(item, str):
            value = item.strip().lower()
            if value:
                normalized.append(value)
    return normalized


def _get_or_create_task_subscription(db: Session, user_id: int) -> TaskSubscription:
    subscription = db.query(TaskSubscription).filter(TaskSubscription.user_id == user_id).first()
    if subscription is not None:
        if getattr(subscription, "min_reward", None) is None:
            subscription.min_reward = 0
        return subscription

    subscription = TaskSubscription(user_id=user_id, tags="[]", difficulties="[]", min_reward=0)
    db.add(subscription)
    db.flush()
    return subscription


@router.get("/tracking", response_model=TaskTrackingSettingsOut)
def get_task_tracking_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
) -> TaskTrackingSettingsOut:
    subscription = db.query(TaskSubscription).filter(TaskSubscription.user_id == current_user.id).first()
    if subscription is None:
        return TaskTrackingSettingsOut(tags=[], difficulties=[], min_reward=0)

    allowed_difficulties = {"easy", "medium", "hard"}
    tags = _safe_json_string_list(subscription.tags)
    difficulties = [value for value in _safe_json_string_list(subscription.difficulties) if value in allowed_difficulties]
    return TaskTrackingSettingsOut(tags=tags, difficulties=difficulties, min_reward=max(0, int(subscription.min_reward or 0)))


@router.put("/tracking", response_model=TaskTrackingSettingsOut)
def update_task_tracking_settings(
    payload: TaskTrackingSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
) -> TaskTrackingSettingsOut:
    subscription = _get_or_create_task_subscription(db, current_user.id)

    normalized_tags = _normalize_tags(payload.tags)
    normalized_difficulties: List[str] = []
    seen_difficulties: Set[str] = set()
    for difficulty in payload.difficulties:
        value = difficulty.value
        if value in seen_difficulties:
            continue
        seen_difficulties.add(value)
        normalized_difficulties.append(value)

    subscription.tags = json.dumps(normalized_tags)
    subscription.difficulties = json.dumps(normalized_difficulties)
    subscription.min_reward = max(0, int(payload.min_reward))

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not save tracking settings") from exc

    return TaskTrackingSettingsOut(tags=normalized_tags, difficulties=normalized_difficulties, min_reward=subscription.min_reward)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> TaskOut:
    creator = _get_auth_user_or_404(auth_db, current_user.id)
    if creator.balance < payload.reward:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient balance to create task")

    task = Task(
        creator_id=current_user.id,
        title=payload.title.strip() if payload.title else None,
        description=payload.description.strip(),
        reward=payload.reward,
        difficulty=payload.difficulty,
        estimated_minutes=payload.estimated_minutes,
        mode=payload.mode,
        status=TaskStatus.open,
    )

    db.add(task)

    tag_names = _normalize_tags(payload.tags)
    task.tags = [_ensure_tag(db, tag_name) for tag_name in tag_names]
    db.flush()
    _record_activity(
        db,
        user_id=current_user.id,
        task=task,
        event_type="task_created",
        actor_username=current_user.telegram_username,
        balance_delta=-int(task.reward),
    )
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create task") from exc

    creator.balance -= payload.reward
    try:
        auth_db.commit()
    except Exception as exc:
        auth_db.rollback()
        try:
            db.delete(task)
            db.commit()
        except Exception:
            db.rollback()
        raise HTTPException(status_code=500, detail="Could not reserve reward") from exc

    task = _get_task_or_404(db, task.id)
    _notify_subscribers_new_task(db, auth_db, task)
    return _serialize_task(_get_task_or_404(db, task.id), creator_telegram_username=current_user.telegram_username)


@router.get("", response_model=List[TaskOut])
def list_tasks(
    mode: Optional[TaskMode] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    min_reward: Optional[int] = Query(default=None, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> List[TaskOut]:
    query = _task_query(db).filter(Task.status == TaskStatus.open)

    if mode is not None:
        query = query.filter(Task.mode == mode)

    if tag:
        query = query.join(Task.tags).filter(func.lower(Tag.name) == tag.strip().lower())

    if min_reward is not None:
        query = query.filter(Task.reward >= min_reward)

    tasks = query.order_by(Task.created_at.desc()).distinct().all()
    username_map = _creator_username_map(auth_db, (task.creator_id for task in tasks))
    assignee_map = _user_username_map(auth_db, (task.assignee_id for task in tasks))
    return [
        _serialize_task(
            task,
            creator_telegram_username=username_map.get(task.creator_id),
            assignee_telegram_username=assignee_map.get(task.assignee_id or -1),
        )
        for task in tasks
    ]


@router.get("/taken", response_model=List[TaskOut])
def list_taken_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> List[TaskOut]:
    tasks = _task_query(db).filter(Task.assignee_id == current_user.id).order_by(Task.updated_at.desc()).all()
    username_map = _creator_username_map(auth_db, (task.creator_id for task in tasks))
    assignee_map = _user_username_map(auth_db, (task.assignee_id for task in tasks))
    return [
        _serialize_task(
            task,
            creator_telegram_username=username_map.get(task.creator_id),
            assignee_telegram_username=assignee_map.get(task.assignee_id or -1),
        )
        for task in tasks
    ]


@router.get("/given", response_model=List[TaskOut])
def list_given_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> List[TaskOut]:
    tasks = _task_query(db).filter(Task.creator_id == current_user.id).order_by(Task.updated_at.desc()).all()
    username_map = _creator_username_map(auth_db, (task.creator_id for task in tasks))
    assignee_map = _user_username_map(auth_db, (task.assignee_id for task in tasks))
    return [
        _serialize_task(
            task,
            creator_telegram_username=username_map.get(task.creator_id),
            assignee_telegram_username=assignee_map.get(task.assignee_id or -1),
        )
        for task in tasks
    ]


@router.get("/history", response_model=List[TaskActivityOut])
def get_history(
    limit: int = Query(default=100, ge=1, le=300),
    category: str = Query(default="all"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
) -> List[TaskActivityOut]:
    query = db.query(TaskActivity).filter(TaskActivity.user_id == current_user.id)

    event_types = _history_event_types_for_category(category)
    if event_types:
        query = query.filter(TaskActivity.event_type.in_(event_types))

    return query.order_by(TaskActivity.created_at.desc(), TaskActivity.id.desc()).limit(limit).all()


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> TaskOut:
    task = _get_task_or_404(db, task_id)
    creator_username = auth_db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()
    assignee_username = auth_db.query(User.telegram_username).filter(User.id == task.assignee_id).scalar() if task.assignee_id else None
    return _serialize_task(task, creator_telegram_username=creator_username, assignee_telegram_username=assignee_username)


@router.post("/{task_id}/take", response_model=TaskOut)
def take_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> TaskOut:
    task = _get_task_or_404(db, task_id)

    if task.creator_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Creators cannot take their own task")

    if task.status != TaskStatus.open:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only open tasks can be taken")

    creator_username = auth_db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()
    creator_username = creator_username or f"#{task.creator_id}"

    task.status = TaskStatus.in_work
    task.assignee_id = current_user.id
    _record_activity(
        db,
        user_id=task.creator_id,
        task=task,
        event_type="task_taken",
        actor_username=current_user.telegram_username,
    )
    _record_activity(
        db,
        user_id=current_user.id,
        task=task,
        event_type="task_taken_by_you",
        actor_username=current_user.telegram_username,
        other_username=creator_username,
    )

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not take task") from exc

    task = _get_task_or_404(db, task_id)
    _notify_creator_task_taken_web(db, auth_db, task, current_user.telegram_username)
    creator_username = auth_db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()
    return _serialize_task(task, creator_telegram_username=creator_username, assignee_telegram_username=current_user.telegram_username)


@router.post("/{task_id}/complete", response_model=TaskOut)
def complete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> TaskOut:
    task = _get_task_or_404(db, task_id)

    if task.creator_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the creator can complete this task")

    if task.status != TaskStatus.in_work:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only tasks in work can be completed")

    assignee_id = task.assignee_id
    task.status = TaskStatus.done

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not complete task") from exc

    assignee = _get_auth_user_or_404(auth_db, assignee_id) if assignee_id is not None else None
    if assignee is None:
        task.status = TaskStatus.in_work
        db.commit()
        raise HTTPException(status_code=500, detail="Could not reward assignee")

    assignee.balance += int(task.reward)
    try:
        auth_db.commit()
    except Exception as exc:
        auth_db.rollback()
        task.status = TaskStatus.in_work
        db.commit()
        raise HTTPException(status_code=500, detail="Could not reward assignee") from exc

    task = _get_task_or_404(db, task_id)
    assignee_username = assignee.telegram_username
    _record_activity(
        db,
        user_id=task.creator_id,
        task=task,
        event_type="task_completed",
        actor_username=assignee_username,
    )
    _record_activity(
        db,
        user_id=task.creator_id,
        task=task,
        event_type="task_completion_confirmed",
        actor_username=current_user.telegram_username,
    )
    _record_activity(
        db,
        user_id=assignee.id,
        task=task,
        event_type="task_completion_confirmed",
        actor_username=current_user.telegram_username,
        other_username=assignee_username,
        balance_delta=int(task.reward),
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
    creator_username = auth_db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()
    return _serialize_task(task, creator_telegram_username=creator_username, assignee_telegram_username=assignee_username)


@router.post("/{task_id}/cancel", response_model=TaskOut)
def cancel_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> TaskOut:
    task = _get_task_or_404(db, task_id)

    if task.creator_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the creator can cancel this task")

    if task.status not in {TaskStatus.open, TaskStatus.in_work}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only open or in-work tasks can be cancelled")

    previous_status = task.status
    previous_assignee_id = task.assignee_id
    previous_assignee_username = None
    if previous_assignee_id is not None:
        previous_assignee_username = auth_db.query(User.telegram_username).filter(User.id == previous_assignee_id).scalar()

    task.status = TaskStatus.cancelled
    task.assignee_id = None

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not cancel task") from exc

    creator = _get_auth_user_or_404(auth_db, current_user.id)
    creator.balance += int(task.reward)
    try:
        auth_db.commit()
    except Exception as exc:
        auth_db.rollback()
        task.status = previous_status
        task.assignee_id = previous_assignee_id
        db.commit()
        raise HTTPException(status_code=500, detail="Could not refund reward") from exc

    _record_activity(
        db,
        user_id=current_user.id,
        task=task,
        event_type="task_cancelled",
        actor_username=current_user.telegram_username,
        balance_delta=int(task.reward),
    )
    if previous_assignee_id is not None:
        _record_activity(
            db,
            user_id=previous_assignee_id,
            task=task,
            event_type="task_cancelled",
            actor_username=current_user.telegram_username,
            other_username=previous_assignee_username,
        )
    try:
        db.commit()
    except Exception:
        db.rollback()

    task = _get_task_or_404(db, task_id)
    creator_username = auth_db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()
    assignee_username = auth_db.query(User.telegram_username).filter(User.id == task.assignee_id).scalar() if task.assignee_id else None
    return _serialize_task(task, creator_telegram_username=creator_username, assignee_telegram_username=assignee_username)


@router.post("/{task_id}/leave", response_model=TaskOut)
def leave_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> TaskOut:
    task = _get_task_or_404(db, task_id)

    if task.status != TaskStatus.in_work:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only in-work tasks can be left")

    if task.assignee_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the current assignee can leave this task")

    creator_username = auth_db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()

    task.status = TaskStatus.open
    task.assignee_id = None
    _record_activity(
        db,
        user_id=task.creator_id,
        task=task,
        event_type="task_released",
        actor_username=current_user.telegram_username,
    )
    _record_activity(
        db,
        user_id=current_user.id,
        task=task,
        event_type="task_released",
        actor_username=current_user.telegram_username,
        other_username=creator_username,
    )

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not leave task") from exc

    task = _get_task_or_404(db, task_id)
    return _serialize_task(
        task,
        creator_telegram_username=creator_username,
        assignee_telegram_username=None,
    )


# ---------------------------------------------------------------------------
# Telegram notification helpers
# ---------------------------------------------------------------------------

def _notify_subscribers_new_task(tasks_db: Session, auth_db: Session, task: Task) -> None:
    """Send notifications to users whose subscriptions match the new task."""
    try:
        from app.core.config import settings
        from app.core.telegram_notify import callback_button, inline_keyboard, send_message, url_button

        tag_names = {t.name.lower() for t in task.tags}
        subscriptions = tasks_db.query(TaskSubscription).all()

        for sub in subscriptions:
            if sub.user_id == task.creator_id:
                continue

            sub_tags = json.loads(sub.tags or "[]")
            sub_diffs = json.loads(sub.difficulties or "[]")

            tag_match = not sub_tags or bool(tag_names & {t.lower() for t in sub_tags})
            diff_match = not sub_diffs or task.difficulty.value in [d.lower() for d in sub_diffs]

            if not (tag_match and diff_match):
                continue

            user = auth_db.query(User).filter(User.id == sub.user_id).first()
            if user is None or not user.telegram_chat_id:
                continue

            task_title = task.title or f"Task #{task.id}"
            diff_emoji = {"easy": "🟢", "medium": "🟡", "hard": "🔴"}.get(task.difficulty.value, "⚪")
            tags_str = ", ".join(t.name for t in task.tags) if task.tags else "—"
            estimated_label = _format_estimated_hours_label(task.estimated_minutes)
            text = (
                f"🆕 <b>New task matching your preferences!</b>\n\n"
                f"📋 <b>{task_title}</b>\n"
                f"{diff_emoji} Difficulty: {task.difficulty.value}\n"
                f"💰 Reward: {task.reward} pts\n"
                f"🏷 Tags: {tags_str}\n"
                f"⏱ Est. time: {estimated_label}\n\n"
                f"Would you like to take it?"
            )
            markup = inline_keyboard(
                [
                    [
                        callback_button("✅ Accept", f"accept_{task.id}"),
                        callback_button("❌ Decline", f"decline_{task.id}"),
                    ]
                ]
            )
            send_message(user.telegram_chat_id, text, reply_markup=markup)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to notify subscribers of new task: %s", exc)


def _notify_creator_task_taken_web(tasks_db: Session, auth_db: Session, task: Task, taker_username: str) -> None:
    """Notify the task creator via Telegram when the task is taken (from web or bot)."""
    try:
        from app.core.config import settings
        from app.core.telegram_notify import inline_keyboard, send_message, url_button

        creator = auth_db.query(User).filter(User.id == task.creator_id).first()
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



