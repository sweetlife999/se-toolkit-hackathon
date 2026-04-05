from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.admin import router as admin_router
from app.api.routes.tasks import router as tasks_router
from app.core.config import settings
from app.models.user import Base
from app.db.session import engine
from app.db.migrations import ensure_task_reward_column, ensure_task_status_cancelled, ensure_user_balance_column
from app.models.task import TaskBase
from app.db.tasks_session import tasks_engine


app = FastAPI(title="VibErrands API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    TaskBase.metadata.create_all(bind=tasks_engine)
    ensure_user_balance_column(engine)
    ensure_task_reward_column(tasks_engine)
    ensure_task_status_cancelled(tasks_engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(tasks_router)
