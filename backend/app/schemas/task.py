from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, PositiveInt

from app.models.task import TaskMode, TaskStatus


class TaskTagOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=120)
    description: str = Field(min_length=5, max_length=10_000)
    reward: PositiveInt
    estimated_minutes: PositiveInt
    mode: TaskMode
    tags: List[str] = Field(default_factory=list)


class TaskUpdateTags(BaseModel):
    tags: List[str] = Field(default_factory=list)


class TaskOut(BaseModel):
    id: int
    creator_id: int
    creator_telegram_username: Optional[str] = None
    title: Optional[str]
    description: str
    reward: int
    estimated_minutes: int
    mode: TaskMode
    status: TaskStatus
    assignee_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    tags: List[TaskTagOut]

    model_config = {"from_attributes": True}


class TaskListFilters(BaseModel):
    mode: Optional[TaskMode] = None
    tag: Optional[str] = None



