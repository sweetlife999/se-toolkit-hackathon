from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_user_balance_column(engine: Engine) -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("users")}
    if "balance" in column_names:
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN balance INTEGER NOT NULL DEFAULT 0"))


def ensure_task_reward_column(engine: Engine) -> None:
    inspector = inspect(engine)
    if "tasks" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("tasks")}
    if "reward" not in column_names and "price" not in column_names:
        return

    with engine.begin() as connection:
        if "price" in column_names and "reward" not in column_names:
            connection.execute(text("ALTER TABLE tasks RENAME COLUMN price TO reward"))

    if engine.dialect.name != "postgresql":
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE tasks ALTER COLUMN reward TYPE INTEGER USING reward::integer"))


def ensure_task_difficulty_column(engine: Engine) -> None:
    inspector = inspect(engine)
    if "tasks" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("tasks")}
    if "difficulty" not in column_names:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE tasks ADD COLUMN difficulty VARCHAR(16) NOT NULL DEFAULT 'medium'")
            )

    with engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE tasks SET difficulty = 'medium' "
                "WHERE difficulty IS NULL OR difficulty NOT IN ('easy', 'medium', 'hard')"
            )
        )


def ensure_task_status_cancelled(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return

    with engine.connect() as connection:
        connection.execution_options(isolation_level="AUTOCOMMIT").execute(
            text("ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'cancelled'")
        )


def ensure_is_admin_column(engine: Engine) -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("users")}
    if "is_admin" not in column_names:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false"))

    with engine.begin() as connection:
        connection.execute(
            text("UPDATE users SET is_admin = true WHERE telegram_username = '@DirectorOfSweetLife'")
        )

