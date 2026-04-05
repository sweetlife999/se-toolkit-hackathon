from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class TaskBase(DeclarativeBase):
    pass


class TaskMode(str, Enum):
    online = "online"
    offline = "offline"


class TaskDifficulty(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class TaskStatus(str, Enum):
    open = "open"
    in_work = "in_work"
    done = "done"
    cancelled = "cancelled"


task_tags = Table(
    "task_tags",
    TaskBase.metadata,
    Column("task_id", ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(TaskBase):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)


class Task(TaskBase):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    creator_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    reward: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[TaskDifficulty] = mapped_column(
        String(16), nullable=False, default=TaskDifficulty.medium, server_default=TaskDifficulty.medium.value, index=True
    )
    estimated_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[TaskMode] = mapped_column(SAEnum(TaskMode, name="task_mode"), nullable=False, index=True)
    status: Mapped[TaskStatus] = mapped_column(
        SAEnum(TaskStatus, name="task_status"), nullable=False, default=TaskStatus.open, index=True
    )
    assignee_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tags = relationship("Tag", secondary=task_tags, lazy="selectin")


class TaskActivity(TaskBase):
    __tablename__ = "task_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    task_title: Mapped[str] = mapped_column(String(120), nullable=False)
    actor_username: Mapped[str] = mapped_column(String(64), nullable=False)
    other_username: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    balance_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)




