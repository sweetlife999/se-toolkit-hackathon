from datetime import datetime

from pydantic import BaseModel, Field


class UserRegister(BaseModel):
    telegram_username: str = Field(
        min_length=4,
        max_length=64,
        pattern=r"^@[A-Za-z0-9_]{3,63}$",
        description="Telegram handle starting with @",
    )
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    telegram_username: str
    password: str


class UserOut(BaseModel):
    id: int
    telegram_username: str
    balance: int
    is_admin: bool = False
    tasks_created: int = 0
    tasks_finished: int = 0

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str


class UserHistoryOut(BaseModel):
    id: int
    event_type: str
    message: str
    balance_delta: int
    created_at: datetime

    model_config = {"from_attributes": True}


