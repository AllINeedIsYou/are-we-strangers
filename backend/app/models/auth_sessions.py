from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import String, DateTime, func, ForeignKey, BigInteger
from backend.database.base import Base
from datetime import datetime,timezone

class AuthSession(Base):
    __tablename__ = 'auth_session'

    id:Mapped[int]=mapped_column(primary_key=True)

    user_id:Mapped[int]=mapped_column(ForeignKey('users.id'), index=True)

    token_hash:Mapped[str]=mapped_column(String(64),unique=True)

    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())

    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))

    revoked_at: Mapped[datetime|None] = mapped_column(DateTime(timezone=True),default=None)