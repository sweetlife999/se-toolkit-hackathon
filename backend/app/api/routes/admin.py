from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.db.tasks_session import get_tasks_db
from app.models.task import Task, TaskStatus
from app.models.user import User, UserHistory
from app.schemas.admin import (
    AdminActionResponse,
    AdminAdjustAllBalancesPayload,
    AdminAdjustUserBalancePayload,
    AdminDecrementUserBalancePayload,
    AdminManageAdminPayload,
    AdminRemoveTaskPayload,
)


router = APIRouter(prefix="/admin", tags=["admin"])


def _assert_admin(current_user: User) -> None:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def _get_user_by_handle_or_404(db: Session, handle: str) -> User:
    user = db.query(User).filter(User.telegram_username == handle).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _log_user_history(db: Session, *, user_id: int, event_type: str, message: str, balance_delta: int = 0) -> None:
    db.add(
        UserHistory(
            user_id=user_id,
            event_type=event_type,
            message=message,
            balance_delta=balance_delta,
        )
    )


@router.get("/verify", response_model=AdminActionResponse)
def verify_admin(current_user: User = Depends(get_current_user)) -> AdminActionResponse:
    _assert_admin(current_user)
    return AdminActionResponse(detail="Admin access granted")


@router.post("/task/remove", response_model=AdminActionResponse)
def remove_task_by_admin(
    payload: AdminRemoveTaskPayload,
    current_user: User = Depends(get_current_user),
    auth_db: Session = Depends(get_db),
    tasks_db: Session = Depends(get_tasks_db),
) -> AdminActionResponse:
    _assert_admin(current_user)

    task = tasks_db.query(Task).filter(Task.id == payload.task_id).first()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    creator = auth_db.query(User).filter(User.id == task.creator_id).first()
    if creator is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task creator not found")

    task_name = task.title or f"Task #{task.id}"
    refund = int(task.reward) if task.status != TaskStatus.cancelled else 0

    if refund:
        creator.balance += refund

    _log_user_history(
        auth_db,
        user_id=creator.id,
        event_type="admin_task_removed",
        message=f"Task {task_name} was removed by admins",
        balance_delta=refund,
    )

    try:
        auth_db.commit()
    except Exception as exc:
        auth_db.rollback()
        raise HTTPException(status_code=500, detail="Could not refund task creator") from exc

    try:
        tasks_db.delete(task)
        tasks_db.commit()
    except Exception as exc:
        tasks_db.rollback()
        if refund:
            creator.balance -= refund
        _log_user_history(
            auth_db,
            user_id=creator.id,
            event_type="admin_task_remove_reverted",
            message=f"Task removal rollback for {task_name} due to internal error",
            balance_delta=-refund,
        )
        auth_db.commit()
        raise HTTPException(status_code=500, detail="Could not remove task") from exc

    return AdminActionResponse(detail="Task removed")


@router.post("/balance/increment-user", response_model=AdminActionResponse)
def increment_user_balance(
    payload: AdminAdjustUserBalancePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminActionResponse:
    _assert_admin(current_user)

    user = _get_user_by_handle_or_404(db, payload.user_handle)
    amount = int(payload.amount)
    user.balance += amount
    _log_user_history(
        db,
        user_id=user.id,
        event_type="admin_balance_increment",
        message="Your balance has been incremented by admins.",
        balance_delta=amount,
    )
    db.commit()

    return AdminActionResponse(detail="User balance incremented")


@router.post("/balance/increment-all", response_model=AdminActionResponse)
def increment_all_balances(
    payload: AdminAdjustAllBalancesPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminActionResponse:
    _assert_admin(current_user)

    users = db.query(User).all()
    amount = int(payload.amount)
    for user in users:
        user.balance += amount
        _log_user_history(
            db,
            user_id=user.id,
            event_type="admin_balance_increment_all",
            message=f"Your balance has been incremented by admins. Comment: {payload.message}",
            balance_delta=amount,
        )

    db.commit()
    return AdminActionResponse(detail=f"Incremented balances for {len(users)} users")


@router.post("/balance/decrement-user", response_model=AdminActionResponse)
def decrement_user_balance(
    payload: AdminDecrementUserBalancePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminActionResponse:
    _assert_admin(current_user)

    user = _get_user_by_handle_or_404(db, payload.user_handle)
    amount = int(payload.amount)
    if user.balance < amount:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User balance is insufficient")

    user.balance -= amount
    _log_user_history(
        db,
        user_id=user.id,
        event_type="admin_balance_decrement",
        message=f"Your balance has been decremented by admins. Comment: {payload.comment}",
        balance_delta=-amount,
    )
    db.commit()

    return AdminActionResponse(detail="User balance decremented")


@router.post("/add-admin", response_model=AdminActionResponse)
def add_admin(
    payload: AdminManageAdminPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminActionResponse:
    _assert_admin(current_user)

    user = _get_user_by_handle_or_404(db, payload.user_handle)
    user.is_admin = True
    db.commit()

    return AdminActionResponse(detail=f"{payload.user_handle} is now an admin")


@router.post("/remove-admin", response_model=AdminActionResponse)
def remove_admin(
    payload: AdminManageAdminPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminActionResponse:
    _assert_admin(current_user)

    user = _get_user_by_handle_or_404(db, payload.user_handle)
    if user.telegram_username == "@DirectorOfSweetLife":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot remove @DirectorOfSweetLife from admin")

    user.is_admin = False
    db.commit()

    return AdminActionResponse(detail=f"{payload.user_handle} has been removed from admins")

