from pydantic import BaseModel, Field, PositiveInt


class AdminRemoveTaskPayload(BaseModel):
    task_id: int = Field(gt=0)


class AdminAdjustUserBalancePayload(BaseModel):
    user_handle: str = Field(min_length=4, max_length=64, pattern=r"^@[A-Za-z0-9_]{3,63}$")
    amount: PositiveInt


class AdminAdjustAllBalancesPayload(BaseModel):
    amount: PositiveInt
    message: str = Field(min_length=1, max_length=300)


class AdminDecrementUserBalancePayload(BaseModel):
    user_handle: str = Field(min_length=4, max_length=64, pattern=r"^@[A-Za-z0-9_]{3,63}$")
    amount: PositiveInt
    comment: str = Field(min_length=1, max_length=300)


class AdminManageAdminPayload(BaseModel):
    user_handle: str = Field(min_length=4, max_length=64, pattern=r"^@[A-Za-z0-9_]{3,63}$")


class AdminNotifyAllPayload(BaseModel):
    message: str = Field(min_length=1, max_length=300)


class AdminActionResponse(BaseModel):
    detail: str

