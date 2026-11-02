from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import DateTime, func, ForeignKey,UniqueConstraint,CheckConstraint
from backend.database.base import Base
from datetime import datetime


class Chats(Base):
    __tablename__ = 'chats'
    __table_args__=(UniqueConstraint('first_user_id','second_user_id',name="uq_chats_user_pair"),CheckConstraint('first_user_id<second_user_id',name="ck_chats_user_order"))

    id:Mapped[int]=mapped_column(primary_key=True)

    first_user_id:Mapped[int]=mapped_column(ForeignKey('users.id'),index=True)

    second_user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)

    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())
