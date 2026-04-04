from pydantic import BaseModel, Field


class UserRegister(BaseModel):
    telegram_username: str = Field(min_length=3, max_length=64)
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
