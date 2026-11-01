from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import String, DateTime, func, ForeignKey
from backend.database.base import Base
from datetime import datetime

class EmailVerification(Base):
    __tablename__ = 'email_verifications'

    id:Mapped[int]=mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    email:Mapped[str]=mapped_column(String(320))

    token_hash:Mapped[str]=mapped_column(String(64),unique=True)

    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())

    used_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),default=None)

    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))

    revoked_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),default=None)
