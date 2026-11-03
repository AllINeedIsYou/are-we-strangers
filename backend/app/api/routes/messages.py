from fastapi import APIRouter
from backend.app.api.dependencies import CurrentUser
from backend.app.schemas.messages import MessageResponse, CreateMessageRequest
from backend.app.services.messages import create_message,get_chat_messages
from backend.database.session import SessionDep

message_router=APIRouter(prefix='/chats/{chat_id}/messages', tags=['Messages'])

@message_router.post('',response_model=MessageResponse, status_code=201)
def send_message(session:SessionDep,user:CurrentUser,chat_id:int,data:CreateMessageRequest):
    new_message=create_message(session=session,user=user,chat_id=chat_id,data=data)
    return new_message

@message_router.get('',response_model=list[MessageResponse])
def get_messages(session:SessionDep,chat_id:int,user:CurrentUser,before_id:int|None=None):
    messages=get_chat_messages(session=session,user=user,before_id=before_id,chat_id=chat_id)
    return messages
