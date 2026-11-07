from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import DateTime, func, ForeignKey,Text,false
from backend.database.base import Base
from datetime import datetime


class Messages(Base):
    __tablename__ = 'messages'

    id:Mapped[int]=mapped_column(primary_key=True)

    chat_id:Mapped[int]=mapped_column(ForeignKey('chats.id'),index=True)

    sender_id:Mapped[int]=mapped_column(ForeignKey('users.id'),index=True)

    text:Mapped[str]=mapped_column(Text)

    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

    is_read:Mapped[bool]=mapped_column(server_default=false())

    is_edited:Mapped[bool]=mapped_column(server_default=false())