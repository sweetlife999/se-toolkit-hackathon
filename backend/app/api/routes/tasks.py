from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.db.tasks_session import get_tasks_db
from app.models.task import Tag, Task, TaskMode, TaskStatus
from app.models.user import User
from app.schemas.task import TaskCreate, TaskOut


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


def _serialize_task(task: Task, creator_telegram_username: Optional[str] = None) -> TaskOut:
    task_out = TaskOut.model_validate(task)
    return task_out.model_copy(update={"creator_telegram_username": creator_telegram_username})


def _creator_username_map(auth_db: Session, creator_ids: Iterable[int]) -> Dict[int, str]:
    unique_creator_ids = {creator_id for creator_id in creator_ids}
    if not unique_creator_ids:
        return {}

    rows = auth_db.query(User.id, User.telegram_username).filter(User.id.in_(unique_creator_ids)).all()
    return {user_id: telegram_username for user_id, telegram_username in rows}


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
) -> TaskOut:
    task = Task(
        creator_id=current_user.id,
        title=payload.title.strip() if payload.title else None,
        description=payload.description.strip(),
        price=payload.price,
        estimated_minutes=payload.estimated_minutes,
        mode=payload.mode,
        status=TaskStatus.open,
    )

    db.add(task)

    tag_names = _normalize_tags(payload.tags)
    task.tags = [_ensure_tag(db, tag_name) for tag_name in tag_names]
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create task") from exc

    return _serialize_task(_get_task_or_404(db, task.id), creator_telegram_username=current_user.telegram_username)


@router.get("", response_model=List[TaskOut])
def list_tasks(
    mode: Optional[TaskMode] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> List[TaskOut]:
    query = _task_query(db).filter(Task.status == TaskStatus.open)

    if mode is not None:
        query = query.filter(Task.mode == mode)

    if tag:
        query = query.join(Task.tags).filter(func.lower(Tag.name) == tag.strip().lower())

    tasks = query.order_by(Task.created_at.desc()).distinct().all()
    username_map = _creator_username_map(auth_db, (task.creator_id for task in tasks))
    return [_serialize_task(task, creator_telegram_username=username_map.get(task.creator_id)) for task in tasks]


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_tasks_db),
    auth_db: Session = Depends(get_db),
) -> TaskOut:
    task = _get_task_or_404(db, task_id)
    creator_username = auth_db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()
    return _serialize_task(task, creator_telegram_username=creator_username)


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

    task.status = TaskStatus.in_work
    task.assignee_id = current_user.id

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not take task") from exc

    task = _get_task_or_404(db, task_id)
    creator_username = auth_db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()
    return _serialize_task(task, creator_telegram_username=creator_username)


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

    task.status = TaskStatus.done

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not complete task") from exc

    task = _get_task_or_404(db, task_id)
    creator_username = auth_db.query(User.telegram_username).filter(User.id == task.creator_id).scalar()
    return _serialize_task(task, creator_telegram_username=creator_username)



