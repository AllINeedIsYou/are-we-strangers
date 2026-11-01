from pathlib import Path
from pydantic import EmailStr, HttpUrl
from pydantic_settings import BaseSettings,SettingsConfigDict
from pydantic import SecretStr

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

class MailSettings(BaseSettings):
    SMTP_HOST:str
    SMTP_PORT:int
    SMTP_USERNAME:EmailStr
    SMTP_PASSWORD:SecretStr
    EMAIL_VERIFICATION_URL:HttpUrl

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

mail_settings = MailSettings()
