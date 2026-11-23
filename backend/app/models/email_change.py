from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import DateTime, func, ForeignKey, String, BigInteger
from backend.database.base import Base
from datetime import datetime


class EmailChanges(Base):
    __tablename__ = 'email_changes'

    id:Mapped[int]=mapped_column(primary_key=True)

    user_id:Mapped[int]=mapped_column(ForeignKey('users.id'),index=True)

    old_email:Mapped[str]=mapped_column(String(320))

    new_email: Mapped[str] = mapped_column(String(320))

    phone:Mapped[str]=mapped_column(String(64))

    token_hash:Mapped[str]=mapped_column(String(64),unique=True)

    code_hash:Mapped[str|None]=mapped_column(String(255))

    telegram_user_id:Mapped[int|None]=mapped_column(BigInteger)

    attempts:Mapped[int]=mapped_column(default=0)

    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))

    last_sent_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True))

    used_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True))

    revoked_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True))


