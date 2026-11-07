from fastapi import APIRouter
from backend.app.api.dependencies import CurrentUser
from backend.app.schemas.messages import MessageResponse, CreateMessageRequest,EditMessageRequest,DeleteMessagesRequest,DeleteMessagesResponse
from backend.app.services.chats import get_chat_for_user
from backend.app.services.messages import create_message,get_chat_messages,edit_message,delete_messages
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

@message_router.patch('/{message_id}',response_model=MessageResponse)
def message_edit(session:SessionDep,user:CurrentUser,chat_id:int,message_id:int,data:EditMessageRequest):
    chat,message,changed=edit_message(session, user, chat_id, message_id, data)
    if changed:
        event={
            'type':'message.updated',
            'message': MessageResponse.model_validate(message).model_dump(mode='json')
        }

        from_thread.run(
            connection_manager.send_to_user,chat.first_user_id,event
        )

        from_thread.run(
            connection_manager.send_to_user,chat.second_user_id,event
        )

    return message

@message_router.delete('/delete',response_model=DeleteMessagesResponse)
def messages_delete(session:SessionDep,user:CurrentUser,chat_id:int,data:DeleteMessagesRequest):
    chat, changed_message_ids=delete_messages(session, user, chat_id, data)
    response=DeleteMessagesResponse(
        chat_id=chat.id,
        actor_id=user.id,
        scope=data.scope,
        message_ids=changed_message_ids
    )

    if changed_message_ids!=[]:
        event={
            "type": "messages.deleted",
            **response.model_dump(mode='json')
        }
        partner_id=chat.first_user_id if chat.second_user_id==user.id else chat.second_user_id
        if data.scope=='self':
            from_thread.run(
                connection_manager.send_to_user, user.id, event
            )

        elif data.scope=='everyone':
            from_thread.run(
                connection_manager.send_to_user, user.id, event
            )
            from_thread.run(
                connection_manager.send_to_user, partner_id, event
            )
    return response