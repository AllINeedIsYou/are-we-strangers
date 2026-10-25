from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import String, DateTime, func
from backend.database.base import Base
from datetime import datetime,timezone
class Users(Base):
    __tablename__ = 'users'

    id:Mapped[int]=mapped_column(primary_key=True)

    phone:Mapped[str]=mapped_column(String(64),unique=True)

    email: Mapped[str] = mapped_column(String(320), unique=True)

    name:Mapped[str]=mapped_column(String(40))

    username: Mapped[str] = mapped_column(String(32),unique=True)

    password_hash:Mapped[str]=mapped_column(String(255))

    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

    phone_verified_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),default=None)

    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

