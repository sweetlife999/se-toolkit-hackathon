from typing import Optional

from sqlalchemy.engine import make_url
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    tasks_database_url: Optional[str] = None
    jwt_secret_key: str
    admin_password: str = "change-me-admin-password"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    cors_origins: str = "http://localhost:5173"
    telegram_bot_token: str = ""
    telegram_bot_secret: str = "change-me-bot-secret"
    site_url: str = "https://github.com/sweetlife999/se-toolkit-hackathon"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def tasks_database_url_resolved(self) -> str:
        if self.tasks_database_url:
            return self.tasks_database_url

        url = make_url(self.database_url)
        base_name = url.database or "viberrands"
        return url.set(database=f"{base_name}_tasks").render_as_string(hide_password=False)


settings = Settings()
