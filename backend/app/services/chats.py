from psycopg.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy import or_
from backend.app.models import Chats,Users
from fastapi import HTTPException
from datetime import datetime,timezone


def get_or_create_chat(session:Session,user:Users,partner_id:int):
    if user.id==partner_id:
        raise HTTPException(status_code=400,detail='Нельзя создать диалог с собой')

    partner=session.get(Users,partner_id)
    if partner is None:
        raise HTTPException(status_code=404,detail='Пользователь не найден')

    min_id=min(partner.id,user.id)
    max_id = max(partner.id, user.id)

    chat=session.query(Chats).filter(Chats.first_user_id==min_id,Chats.second_user_id==max_id).first()
    try:
        if chat is None:
            now=datetime.now(timezone.utc)
            new_chat=Chats(
                first_user_id=min_id,
                second_user_id=max_id,
                created_at=now
            )
            session.add(new_chat)
            session.commit()
            session.refresh(new_chat)
            return new_chat, partner
        else:
            return chat, partner

    except IntegrityError as error:
        session.rollback()

        if not isinstance(error.orig, UniqueViolation):
            raise

        if error.orig.diag.constraint_name != "uq_chats_user_pair":
            raise

        chat = session.query(Chats).filter(Chats.first_user_id == min_id, Chats.second_user_id == max_id).first()
        if chat is None:
            raise

    except SQLAlchemyError:
        session.rollback()
        raise

    return chat, partner

def get_user_chats(session:Session,user:Users):
    chats=session.query(Chats).filter(or_(Chats.first_user_id==user.id,Chats.second_user_id==user.id)).order_by(Chats.created_at.desc(),Chats.id.desc()).all()
    chatandpartner=[]
    for chat in chats:
        partner_id=(chat.second_user_id if chat.first_user_id==user.id else chat.first_user_id )

        partner=session.get(Users,partner_id)
        chatandpartner.append([chat,partner])

    return chatandpartner #[[],[],[]]

def get_chat_for_user(session:Session,user:Users,chat_id:int):
    chat=session.query(Chats).filter(Chats.id==chat_id,or_(Chats.first_user_id==user.id,Chats.second_user_id==user.id)).first()
    if chat is None:
        raise HTTPException(status_code=404,detail="Чат не найден")
    return chat