from datetime import datetime,timezone
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.app.models import Users,Messages
from backend.app.schemas.messages import CreateMessageRequest, ReadMessagesRequest, EditMessageRequest, \
    DeleteMessagesRequest
from backend.app.services.chats import get_chat_for_user
from fastapi import HTTPException
from backend.app.services.message_visibility import message_visible_to

def create_message(session:Session,user:Users,chat_id:int,data:CreateMessageRequest):
    chat=get_chat_for_user(session, user, chat_id)

    if data.reply_to_id is not None:
        message_reply=session.query(Messages).filter(Messages.chat_id==chat_id,Messages.id==data.reply_to_id,message_visible_to(user.id)).first()
        if (message_reply is None):
           raise HTTPException(status_code=404, detail="Сообщение не найдено")

    try:
        new_message=Messages(
            chat_id=chat_id,
            sender_id=user.id,
            text=data.text,
            reply_to_id=data.reply_to_id
        )
        session.add(new_message)
        session.commit()
        session.refresh(new_message)

    except SQLAlchemyError:
        session.rollback()
        raise

    return new_message

def get_chat_messages(session:Session,user:Users,chat_id:int,limit:int=50,before_id: int | None = None,after_id: int | None = None):
    chat = get_chat_for_user(session, user, chat_id)
    messages=session.query(Messages).filter(Messages.chat_id==chat.id,message_visible_to(user.id))
    if (before_id is not None) and (after_id is not None):
        raise HTTPException(status_code=422)

    if (before_id is None) and (after_id is None):
        messages=messages.order_by(Messages.id.desc()).limit(limit).all()
        messages.reverse()

    if before_id is not None:
        messages=messages.filter(Messages.id<before_id).order_by(Messages.id.desc()).limit(limit).all()
        messages.reverse()

    if after_id is not None:
        messages = messages.filter(Messages.id > after_id).order_by(Messages.id.asc()).limit(limit).all()



    return messages

def mark_messages_read(session:Session,user:Users,chat_id:int,data:ReadMessagesRequest):
    chat=get_chat_for_user(session, user, chat_id)

    list_messages_id=data.message_ids
    changed_messages_id=[]
    try:
        messages = session.query(Messages).filter(Messages.chat_id == chat.id,
                                                  message_visible_to(user.id),
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
        message=session.query(Messages).filter(Messages.chat_id==chat_id,Messages.id==message_id,message_visible_to(user.id)).with_for_update().first()
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

def delete_messages(session:Session,user:Users,chat_id:int,data:DeleteMessagesRequest):
    chat=get_chat_for_user(session, user, chat_id)
    try:

        messages=session.query(Messages).filter(Messages.chat_id==chat_id,Messages.id.in_(data.message_ids)).order_by(Messages.id).with_for_update().all()
        changed_message_ids=[]
        for message in messages:
            if data.scope=='self':

                if message.sender_id==user.id:
                    if not message.deleted_for_sender:
                        message.deleted_for_sender=True
                        changed_message_ids.append(message.id)
                else:
                    if not message.deleted_for_recipient:
                        message.deleted_for_recipient = True
                        changed_message_ids.append(message.id)

            elif data.scope == 'everyone':
                if not (message.deleted_for_recipient and message.deleted_for_sender):
                    message.deleted_for_sender = True
                    message.deleted_for_recipient = True
                    changed_message_ids.append(message.id)

        session.commit()

    except SQLAlchemyError:
        session.rollback()
        raise
    return chat, changed_message_ids

def pin_message(session:Session,user:Users,chat_id:int, message_id:int):
    chat=get_chat_for_user(session, user, chat_id)
    message=session.query(Messages).filter(Messages.id==message_id,Messages.chat_id==chat.id,message_visible_to(user.id)).first()
    if message is None:
        raise HTTPException(status_code=404,detail="Сообщение не найдено")
    try:
        if message.pinned_at is not None:
            return chat,False

        now = datetime.now(timezone.utc)
        message.pinned_at=now
        session.commit()

    except SQLAlchemyError:
        session.rollback()
        raise

    session.refresh(message)
    return chat,True

def unpin_message(session:Session,user:Users,chat_id:int, message_id:int):
    chat=get_chat_for_user(session, user, chat_id)
    message=session.query(Messages).filter(Messages.id==message_id,Messages.chat_id==chat.id,message_visible_to(user.id)).first()
    if message is None:
        raise HTTPException(status_code=404,detail="Сообщение не найдено")
    try:
        if message.pinned_at==None:
            return chat,False
        else:
                message.pinned_at = None
                session.commit()
    except SQLAlchemyError:
        session.rollback()
        raise

    session.refresh(message)
    return chat,True


def get_pinned_messages(session:Session,user:Users,chat_id:int):
    chat = get_chat_for_user(session, user, chat_id)
    message_list=session.query(Messages).filter(Messages.chat_id==chat_id,message_visible_to(user.id),Messages.pinned_at.isnot(None)).order_by(Messages.pinned_at.desc()).all()
    return message_list

def forward_messages(session:Session,user:Users,chat_id:int,source_chat_id:int,message_ids:list[int]):
    chat=get_chat_for_user(session, user, chat_id) #кому
    source_chat=get_chat_for_user(session, user, source_chat_id)#откуда

    messages=session.query(Messages).filter(Messages.id.in_(message_ids), message_visible_to(user.id),Messages.chat_id==source_chat_id).order_by(Messages.id.asc()).all()
    if len(set(message_ids))!=len(messages):
        raise HTTPException(status_code=404)

    try:
        list_of_copy_message=[]
        for message in messages:

            if message.forwarded_from_name is not None:
                name_for_forwarded_from_name =message.forwarded_from_name
            else:
                author=session.get(Users,message.sender_id)
                name_for_forwarded_from_name=author.name

            copy_message=Messages(
                chat_id=chat.id,
                sender_id=user.id,
                text=message.text,
                reply_to_id=None,
                forwarded_from_name=name_for_forwarded_from_name
            )
            session.add(copy_message)
            list_of_copy_message.append(copy_message)
        session.commit()

    except SQLAlchemyError:
        session.rollback()
        raise
    return list_of_copy_message

def search_chat_messages(session:Session,q:str,user:Users,chat_id:int,before_id:int|None=None):
    chat=get_chat_for_user(session, user, chat_id)
    q=q.strip()
    if (not q) or len(q)>256:
        raise HTTPException(status_code=422)
    messages=session.query(Messages).filter(Messages.chat_id==chat.id,message_visible_to(user.id),Messages.text.icontains(q,autoescape=True))
    if before_id is not None:
        messages=messages.filter(Messages.id<before_id)
    messages=messages.order_by(Messages.id.desc()).limit(50).all()
    return messages

def get_message_context(session:Session,user:Users,chat_id:int,message_id:int):
    chat=get_chat_for_user(session, user, chat_id)
    message=session.query(Messages).filter(Messages.id==message_id,Messages.chat_id==chat.id,message_visible_to(user.id)).first()
    if message is None:
        raise HTTPException(status_code=404)

    messages_before=session.query(Messages).filter(Messages.chat_id==chat.id,Messages.id<message.id,message_visible_to(user.id)).order_by(Messages.id.desc()).limit(50).all()
    messages_after=session.query(Messages).filter(Messages.chat_id==chat.id,Messages.id>message.id,message_visible_to(user.id)).order_by(Messages.id.asc()).limit(50).all()
    messages_before.reverse()

    response=messages_before+[message]+messages_after
    return response