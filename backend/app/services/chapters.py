from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.app.models import Users,Chapters
from backend.app.schemas.chapters import ChapterCreateRequest,ChapterDecisionRequest
from backend.app.services.chats import get_chat_for_user
from fastapi import HTTPException
from datetime import datetime,timezone

def create_chapter(session:Session,user:Users,chat_id:int,data:ChapterCreateRequest):
    chat=get_chat_for_user(session, user, chat_id)
    try:
        new_chapters=Chapters(
            chat_id=chat.id,
            author_id=user.id,
            title=data.title,
            status='pending'
        )
        session.add(new_chapters)
        session.commit()
        session.refresh(new_chapters)
    except SQLAlchemyError:
        session.rollback()
        raise
    return new_chapters

def get_chapters(session:Session,user:Users,chat_id:int):
    chat=get_chat_for_user(session, user, chat_id)

    chapters=session.query(Chapters).filter(Chapters.chat_id==chat_id).order_by(Chapters.created_at.asc(),Chapters.id.asc()).all()
    return chapters

def decide_chapter(session:Session,user:Users,chat_id:int,chapter_id:int,data:ChapterDecisionRequest):
    chat=get_chat_for_user(session, user, chat_id)

    chapter=session.query(Chapters).filter(Chapters.chat_id==chat_id,Chapters.id==chapter_id).with_for_update().first()

    if chapter is None:
        raise HTTPException(status_code=404,detail="Глава не найдена")
    if chapter.status!='pending':
        raise HTTPException(status_code=409,detail='По этой главе уже принято решение')
    if chapter.author_id==user.id:
        raise HTTPException(status_code=403,detail="Решение должен принять собеседник")

    try:
        now=datetime.now(timezone.utc)

        chapter.status=data.status
        if data.status=='accepted':
            chapter.started_at=now

        session.commit()
        session.refresh(chapter)
    except SQLAlchemyError:
        session.rollback()
        raise
    return chapter



