from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.app.models import Users, Messages, MutedChat
from backend.app.schemas.notifications import MutedChatsResponse, ChatNotificationsRequest, ChatNotificationsResponse
from backend.app.models.moments import Moments,MessagesForMoments
from backend.app.services.chats import get_chat_for_user
from fastapi import HTTPException




def get_user_muted_chats(session:Session,user:Users):

    chats=session.query(MutedChat.chat_id).filter(MutedChat.user_id==user.id).order_by(MutedChat.chat_id.asc()).all()
    chats_id=[chat.chat_id for chat in chats]

    response=MutedChatsResponse(
        chat_ids=chats_id
    )
    return response

def set_chat_notifications(session:Session,user:Users,chat_id:int,data:ChatNotificationsRequest):
    try:
        chat=get_chat_for_user(session, user, chat_id)
        session.refresh(chat,with_for_update=True)

        mutedchat=session.query(MutedChat).filter(MutedChat.user_id==user.id,MutedChat.chat_id==chat_id).populate_existing().first()

        response=ChatNotificationsResponse(chat_id=chat_id,muted=data.muted)
        boolka = data.muted

        changed=True
        if (boolka==True) and (mutedchat is not None):
            changed=False
            session.commit()


        elif (boolka==True) and (mutedchat is None):
            new_MutedChat=MutedChat(
                user_id=user.id,
                chat_id=chat_id,
            )
            session.add(new_MutedChat)
            session.commit()


        elif (boolka==False) and (mutedchat is not None):
            session.delete(mutedchat)
            session.commit()


        elif (boolka==False) and (mutedchat is None):
            changed = False
            session.commit()



    except (SQLAlchemyError,HTTPException):
        session.rollback()
        raise

    return response, changed