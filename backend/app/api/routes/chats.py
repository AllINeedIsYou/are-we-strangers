from fastapi import APIRouter
from backend.database.session import SessionDep
from backend.app.api.dependencies import CurrentUser
from backend.app.schemas.chats import ChatResponse,CreateChatRequest
from backend.app.services.chats import get_or_create_chat,get_user_chats
from backend.app.schemas.messages import ReadMessagesResponse,ReadMessagesRequest
from backend.app.services.messages import mark_messages_read
from backend.app.core.connections import connection_manager
from anyio import from_thread

chats_router=APIRouter(prefix='/chats',tags=['Chats'])

@chats_router.post('',response_model=ChatResponse)
def get_chat(session:SessionDep,user:CurrentUser,data:CreateChatRequest):
    chat, partner=get_or_create_chat(session=session,user=user,partner_id=data.partner_id)
    return ChatResponse(
        id=chat.id,
        created_at=chat.created_at,
        partner=partner
    )

@chats_router.get('',response_model=list[ChatResponse])
def get_all_chats(session:SessionDep,user:CurrentUser):
    chatandpartner=get_user_chats(session=session,user=user)
    response=[]
    for chat,partner in chatandpartner:
        response.append(ChatResponse(
            id=chat.id,
            created_at=chat.created_at,
            partner=partner
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