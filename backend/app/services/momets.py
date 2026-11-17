from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.app.models import Users,Messages
from backend.app.schemas.moments import MomentCreateRequest,MomentResponse,MessageMomentResponse,ReplyToMomentRequest
from backend.app.models.moments import Moments,MessagesForMoments
from backend.app.services.chats import get_chat_for_user
from fastapi import HTTPException
from backend.app.services.message_visibility import message_visible_to



def create_moment(session:Session,user:Users,chat_id:int,data:MomentCreateRequest):
    chat=get_chat_for_user(session, user, chat_id)

    messages=session.query(Messages).filter(Messages.id.in_(data.message_ids),Messages.chat_id==chat.id,message_visible_to(user.id)).order_by(Messages.id.asc()).all()

    if messages==[]:
        raise HTTPException(status_code=404,detail='Сообщения не найдены')
    if len(set(data.message_ids))!=len(messages):
        raise HTTPException(status_code=404)

    list_new_messagesformoments=[]
    try:

        new_momnet=Moments(
            chat_id=chat.id,
            author_id=user.id,
            reason=data.reason
        )
        session.add(new_momnet)
        session.flush()

        for message in messages:

            author_name=message.forwarded_from_name if message.forwarded_from_name is not None else session.get(Users,message.sender_id).name
            new_messagesformoments = MessagesForMoments(
                moments_id=new_momnet.id,
                author_name=author_name,
                source_message_id=message.id,
                message_created_at=message.created_at,
                text=message.text
            )

            list_new_messagesformoments.append(new_messagesformoments)
            session.add(new_messagesformoments)

        session.commit()


    except SQLAlchemyError:
        session.rollback()
        raise

    return {'moment':new_momnet,'messages':list_new_messagesformoments}

def get_moments(session:Session,user:Users,chat_id:int):
    chat=get_chat_for_user(session, user, chat_id)

    all_moments=session.query(Moments).filter(Moments.chat_id==chat.id).order_by(Moments.created_at.desc()).all()
    if not all_moments:
        return []

    moment_ids=[moment.id for moment in all_moments]
    all_copies=session.query(MessagesForMoments).filter(MessagesForMoments.moments_id.in_(moment_ids)).order_by(MessagesForMoments.source_message_id.asc()).all()
    copies_by_moment={}

    for copy in all_copies:
        copies_by_moment.setdefault(copy.moments_id,[]).append(copy)


    #{moment:[...]}
    result=[]
    for moment in all_moments:
        copies=copies_by_moment.get(moment.id,[])
        result.append({"moment":moment,"messages":copies})

    return result

def reply_to_moment(session:Session,user:Users,chat_id:int,moment_id:int,data:ReplyToMomentRequest):
    chat=get_chat_for_user(session, user, chat_id)

    try:
        moment=session.query(Moments).filter(Moments.chat_id==chat_id,Moments.id==moment_id).with_for_update().first()

        if moment is None:
            raise HTTPException(status_code=404,detail='Момент не найден')
        if moment.author_id==user.id:
            raise HTTPException(status_code=403,detail="Автор момента не может оставить коментарий")
        if moment.response is not None:
            raise HTTPException(status_code=409, detail='Поле ответа уже заполнено')


        moment.response=data.response
        session.commit()
        session.refresh(moment)

        all_copies=session.query(MessagesForMoments).filter(MessagesForMoments.moments_id==moment.id).order_by(MessagesForMoments.source_message_id.asc()).all()

    except SQLAlchemyError:
        session.rollback()
        raise

    return {"moment":moment,"messages":all_copies}
