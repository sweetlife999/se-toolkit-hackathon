from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


tasks_engine = create_engine(
    settings.tasks_database_url_resolved,
    future=True,
    pool_pre_ping=True,
    pool_recycle=300,
)
TasksSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=tasks_engine)


def get_tasks_db():
    db = TasksSessionLocal()
    try:
        yield db
    finally:
        db.close()

