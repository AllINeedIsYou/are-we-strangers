from fastapi import APIRouter
from backend.app.api.dependencies import CurrentUser
from backend.app.schemas.messages import MessageResponse, CreateMessageRequest
from backend.app.services.chats import get_chat_for_user
from backend.app.services.messages import create_message,get_chat_messages
from backend.database.session import SessionDep
from backend.app.core.connections import connection_manager
from anyio import from_thread


message_router=APIRouter(prefix='/chats/{chat_id}/messages', tags=['Messages'])

@message_router.post('',response_model=MessageResponse, status_code=201)
def send_message(session:SessionDep,user:CurrentUser,chat_id:int,data:CreateMessageRequest):
    new_message=create_message(session=session,user=user,chat_id=chat_id,data=data)

    event={
    'type':'message.created',
    'message':MessageResponse.model_validate(new_message).model_dump(mode='json')
    }

    chat=get_chat_for_user(session, user, chat_id)
    first_user=chat.first_user_id
    second_user=chat.second_user_id

    from_thread.run(
        connection_manager.send_to_user, #отправка сообщения 1 юзеру
        first_user,
        event
    )

    from_thread.run(
        connection_manager.send_to_user,  # отправка сообщения 2 юзеру
        second_user,
        event
    )


    return new_message

@message_router.get('',response_model=list[MessageResponse])
def get_messages(session:SessionDep,chat_id:int,user:CurrentUser,before_id:int|None=None):
    messages=get_chat_messages(session=session,user=user,before_id=before_id,chat_id=chat_id)
    return messages
