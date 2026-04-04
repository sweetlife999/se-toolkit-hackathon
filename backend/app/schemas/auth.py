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

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str
