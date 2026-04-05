from pydantic import BaseModel, Field, PositiveInt


class AdminAuthPayload(BaseModel):
    admin_handle: str = Field(min_length=4, max_length=64, pattern=r"^@[A-Za-z0-9_]{3,63}$")
    admin_password: str = Field(min_length=1)


class AdminRemoveTaskPayload(AdminAuthPayload):
    task_id: int = Field(gt=0)


class AdminAdjustUserBalancePayload(AdminAuthPayload):
    user_handle: str = Field(min_length=4, max_length=64, pattern=r"^@[A-Za-z0-9_]{3,63}$")
    amount: PositiveInt


class AdminAdjustAllBalancesPayload(AdminAuthPayload):
    amount: PositiveInt
    message: str = Field(min_length=1, max_length=300)


class AdminDecrementUserBalancePayload(AdminAuthPayload):
    user_handle: str = Field(min_length=4, max_length=64, pattern=r"^@[A-Za-z0-9_]{3,63}$")
    amount: PositiveInt
    comment: str = Field(min_length=1, max_length=300)


class AdminActionResponse(BaseModel):
    detail: str

