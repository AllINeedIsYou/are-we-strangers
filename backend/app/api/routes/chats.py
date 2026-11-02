from fastapi import APIRouter
from backend.database.session import SessionDep
from backend.app.api.dependencies import CurrentUser
from backend.app.schemas.chats import ChatResponse,CreateChatRequest
from backend.app.services.chats import get_or_create_chat,get_user_chats

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