from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import DateTime, func, ForeignKey, UniqueConstraint
from backend.database.base import Base
from datetime import datetime

class MutedChat(Base):
    __tablename__ = 'muted_chats'
    __table_args__ = (UniqueConstraint('user_id','chat_id',name='uq_muted_chats_user_chat'),)

    id:Mapped[int]=mapped_column(primary_key=True)

    user_id:Mapped[int]=mapped_column(ForeignKey('users.id'),index=True)

    chat_id: Mapped[int] = mapped_column(ForeignKey('chats.id'), index=True)

    muted_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())