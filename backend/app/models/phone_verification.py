from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import String, DateTime, func, ForeignKey, BigInteger
from backend.database.base import Base
from datetime import datetime,timezone

class PhoneVerification(Base):
    __tablename__ = 'phone_verifications'

    id:Mapped[int]=mapped_column(primary_key=True)

    user_id:Mapped[int]=mapped_column(ForeignKey("users.id"), index=True)

    token_hash:Mapped[str]=mapped_column(String(64),unique=True)

    code_hash:Mapped[str|None]=mapped_column(String(255),default=None)

    telegram_user_id:Mapped[int|None]=mapped_column(BigInteger,default=None)

    attempts:Mapped[int]=mapped_column(default=0)#кол-во неверных попыток ввода кода

    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))#срок действия заявки

    last_sent_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True), default=None)

    used_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True), default=None)

    revoked_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True), default=None)
