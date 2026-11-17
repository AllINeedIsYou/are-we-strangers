from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import DateTime, func, ForeignKey,String,Text
from backend.database.base import Base
from datetime import datetime

class Moments(Base):
    __tablename__ = "moments"

    id:Mapped[int]=mapped_column(primary_key=True)

    chat_id:Mapped[int]=mapped_column(ForeignKey('chats.id'),index=True)

    author_id: Mapped[int] = mapped_column(ForeignKey('users.id'),index=True)

    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

    reason:Mapped[str]=mapped_column(String(1000))

    response:Mapped[str|None]=mapped_column(String(500),server_default=None)


class MessagesForMoments(Base):
    __tablename__ = "messagesformoments"

    id:Mapped[int]=mapped_column(primary_key=True)

    moments_id:Mapped[int]=mapped_column(ForeignKey('moments.id'),index=True)

    author_name: Mapped[str] = mapped_column(String(40))

    source_message_id:Mapped[int]

    message_created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))

    text: Mapped[str] = mapped_column(Text)








