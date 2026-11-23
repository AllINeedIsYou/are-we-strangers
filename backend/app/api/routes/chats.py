from fastapi import APIRouter, Response

from backend.app.schemas.notifications import ChatNotificationsResponse, ChatNotificationsRequest
from backend.app.services.notifications import set_chat_notifications
from backend.database.session import SessionDep
from backend.app.api.dependencies import CurrentUser
from backend.app.schemas.chats import ChatResponse,CreateChatRequest
from backend.app.services.chats import get_or_create_chat,get_user_chats,get_unread_counts
from backend.app.schemas.messages import ReadMessagesResponse, ReadMessagesRequest, MessageResponse
from backend.app.services.messages import mark_messages_read, get_pinned_messages,unpin_message,pin_message
from backend.app.core.connections import connection_manager
from anyio import from_thread

chats_router=APIRouter(prefix='/chats',tags=['Chats'])

@chats_router.post('',response_model=ChatResponse)
def get_chat(session:SessionDep,user:CurrentUser,data:CreateChatRequest):
    chat, partner=get_or_create_chat(session=session,user=user,partner_id=data.partner_id)
    count=get_unread_counts(session,user,[chat.id])
    return ChatResponse(
        id=chat.id,
        created_at=chat.created_at,
        partner=partner,
        unread_count=count.get(chat.id,0)
    )

@chats_router.get('',response_model=list[ChatResponse])
def get_all_chats(session:SessionDep,user:CurrentUser):
    chatandpartner=get_user_chats(session=session,user=user)
    response=[]
    chats_ids=[chat.id for chat,partner in chatandpartner]
    counts=get_unread_counts(session,user,chats_ids)
    for chat,partner in chatandpartner:
        response.append(ChatResponse(
            id=chat.id,
            created_at=chat.created_at,
            partner=partner,
            unread_count=counts.get(chat.id,0)
        ))
    return response

@chats_router.post('/{chat_id}/read', response_model=ReadMessagesResponse)
def read_messages(session:SessionDep,chat_id:int,user:CurrentUser,data:ReadMessagesRequest):
    chat,changed_messages_id=mark_messages_read(session, user, chat_id, data)
    response=ReadMessagesResponse(
        reader_id=user.id,
        chat_id=chat.id,
        message_ids=changed_messages_id,
    )
    if changed_messages_id!=[]:
        event={
            'type':'messages.read',
            **response.model_dump(mode='json')
        }

        from_thread.run(
            connection_manager.send_to_user,
            chat.first_user_id,
            event

        )

        from_thread.run(
            connection_manager.send_to_user,
            chat.second_user_id,
            event

        )
        return response


    else:
        return response


@chats_router.get('/{chat_id}/pins', response_model=list[MessageResponse])
def get_pins(session:SessionDep,user:CurrentUser,chat_id:int):
    list=get_pinned_messages(session, user, chat_id)
    return list

@chats_router.post('/{chat_id}/pins/{message_id}',status_code=204)
def pin_endpoint_message(session:SessionDep,user:CurrentUser,chat_id:int,message_id:int):
    chat,changed=pin_message(session, user, chat_id, message_id)

    if changed:
        event={
            "type":"chat.pins_changed",
            "chat_id":chat_id
        }

        from_thread.run(
            connection_manager.send_to_user,
            chat.first_user_id,
            event
        )

        from_thread.run(
            connection_manager.send_to_user,
            chat.second_user_id,
            event
        )
    return Response(status_code=204)

@chats_router.delete('/{chat_id}/pins/{message_id}',status_code=204)
def unpin_endpoint_message(session:SessionDep,user:CurrentUser,chat_id:int,message_id:int):
    chat,changed=unpin_message(session, user, chat_id, message_id)

    if changed:
        event = {
            "type": "chat.pins_changed",
            "chat_id": chat_id
        }

        from_thread.run(
            connection_manager.send_to_user,
            chat.first_user_id,
            event
        )

        from_thread.run(
            connection_manager.send_to_user,
            chat.second_user_id,
            event
        )

    return Response(status_code=204)


@chats_router.patch('/{chat_id}/notifications',response_model=ChatNotificationsResponse)
def set_chat_notifications_endpoint(session:SessionDep,user:CurrentUser,chat_id:int,data:ChatNotificationsRequest):
    response,changed=set_chat_notifications(session, user, chat_id, data)

    if changed:
        event={
            "type":"chat.notifications_changed",
            **response.model_dump(mode='json')
        }
        from_thread.run(
            connection_manager.send_to_user,
            user.id,
            event
        )

    return response