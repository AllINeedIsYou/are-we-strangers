from pathlib import Path
from pydantic_settings import BaseSettings,SettingsConfigDict
from pydantic import SecretStr

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

class TelegramSettings(BaseSettings):
    TELEGRAM_BOT_TOKEN:SecretStr
    TELEGRAM_BOT_USERNAME:str

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

telegram_settings=TelegramSettings()