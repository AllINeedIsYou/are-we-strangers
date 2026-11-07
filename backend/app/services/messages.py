from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.app.models import Users,Messages
from backend.app.schemas.messages import CreateMessageRequest,ReadMessagesRequest,EditMessageRequest
from backend.app.services.chats import get_chat_for_user
from fastapi import HTTPException
def create_message(session:Session,user:Users,chat_id:int,data:CreateMessageRequest):
    chat=get_chat_for_user(session, user, chat_id)
    try:
        new_message=Messages(
            chat_id=chat_id,
            sender_id=user.id,
            text=data.text
        )
        session.add(new_message)
        session.commit()
        session.refresh(new_message)

    except SQLAlchemyError:
        session.rollback()
        raise

    return new_message

def get_chat_messages(session:Session,user:Users,chat_id:int,limit:int=50,before_id: int | None = None):
    chat = get_chat_for_user(session, user, chat_id)
    messages=session.query(Messages).filter(Messages.chat_id==chat.id)
    if before_id is not None:
        messages=messages.filter(Messages.id<before_id)

    messages=messages.order_by(Messages.id.desc()).limit(limit).all()

    messages.reverse()

    return messages

def mark_messages_read(session:Session,user:Users,chat_id:int,data:ReadMessagesRequest):
    chat=get_chat_for_user(session, user, chat_id)

    list_messages_id=data.message_ids
    changed_messages_id=[]
    try:
        messages = session.query(Messages).filter(Messages.chat_id == chat.id,
                                                  Messages.sender_id != user.id,
                                                  Messages.is_read.is_(False),
                                                  Messages.id.in_(list_messages_id)).with_for_update().all()
        for message in messages:
            message.is_read=True
            changed_messages_id.append(message.id)

        session.commit()

    except SQLAlchemyError:
        session.rollback()
        raise

    return chat,changed_messages_id

def edit_message(session:Session,user:Users,chat_id:int,message_id:int,data:EditMessageRequest):
    chat=get_chat_for_user(session, user, chat_id)
    try:
        message=session.query(Messages).filter(Messages.chat_id==chat_id,Messages.id==message_id).with_for_update().first()
        if not message:
            raise HTTPException(status_code=404,detail='Сообщение не найдено')
        if message.sender_id!=user.id:
            raise HTTPException(status_code=403, detail='Редактировать сообщение может только автор')


        changed=False
        if message.text!=data.text:
            message.text=data.text
            message.is_edited=True
            changed=True

            session.commit()

        else:
            return chat,message,changed

    except SQLAlchemyError:
        session.rollback()
        raise

    return chat,message,changed
