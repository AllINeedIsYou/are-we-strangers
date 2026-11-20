from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import DateTime, func, ForeignKey, CheckConstraint, String,UniqueConstraint
from backend.database.base import Base
from datetime import datetime


class ArchivedChat(Base):
    __tablename__ = "archivedchat"
    __table_args__ = (UniqueConstraint('chat_id','user_id',name='uq_chat_and_user'),)

    id:Mapped[int]=mapped_column(primary_key=True)

    chat_id:Mapped[int]=mapped_column(ForeignKey('chats.id'))

    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))

    archived_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())



class ArchivedMoment(Base):
    __tablename__ = "archivedmoment"
    __table_args__ = (UniqueConstraint('user_id','moment_id',name='uq_moment_and_user'),)

    id:Mapped[int]=mapped_column(primary_key=True)

    moment_id:Mapped[int]=mapped_column(ForeignKey('moments.id'))

    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))

    archived_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())


class ArchivedFutureQuestion(Base):
    __tablename__ = "archivedfuturequestion"
    __table_args__ = (UniqueConstraint('user_id','futurequestion_id',name='uq_futurequestion_and_user'),)

    id:Mapped[int]=mapped_column(primary_key=True)

    futurequestion_id:Mapped[int]=mapped_column(ForeignKey('futurequestion.id'))

    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))

    archived_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

