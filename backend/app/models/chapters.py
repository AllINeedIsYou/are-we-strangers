from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import DateTime, func, ForeignKey, CheckConstraint, String
from backend.database.base import Base
from datetime import datetime


class Chapters(Base):
    __tablename__ = 'chapters'
    __table_args__ =(CheckConstraint("status IN ('pending','accepted','rejected')",name="ck_chapters_status"),)

    id:Mapped[int]=mapped_column(primary_key=True)

    chat_id:Mapped[int]=mapped_column(ForeignKey('chats.id'),index=True)

    author_id:Mapped[int]=mapped_column(ForeignKey('users.id'),index=True)

    title:Mapped[str]=mapped_column(String(70))

    status:Mapped[str]=mapped_column(String(20),server_default='pending')

    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

    started_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),server_default=None)
