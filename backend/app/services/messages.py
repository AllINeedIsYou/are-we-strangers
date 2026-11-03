from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.app.models import Users,Messages
from backend.app.schemas.messages import CreateMessageRequest
from backend.app.services.chats import get_chat_for_user

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