from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy import DateTime, func, ForeignKey, UniqueConstraint, String
from backend.database.base import Base
from datetime import datetime

class FutureQuestion(Base):
    __tablename__ = 'futurequestion'

    id:Mapped[int]=mapped_column(primary_key=True)

    chat_id:Mapped[int]=mapped_column(ForeignKey('chats.id'))

    author_id:Mapped[int]=mapped_column(ForeignKey('users.id'))

    text:Mapped[str]=mapped_column(String(500))

    opens_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))

    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class FutureQuestionAnswer(Base):
    __tablename__ = 'futurequestionanswer'
    __table_args__ = (UniqueConstraint('question_id','user_id',name="uq_futurequestionanswer"),)

    id:Mapped[int]=mapped_column(primary_key=True)

    question_id:Mapped[int]=mapped_column(ForeignKey('futurequestion.id'))

    user_id:Mapped[int]=mapped_column(ForeignKey('users.id'))

    text: Mapped[str] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


