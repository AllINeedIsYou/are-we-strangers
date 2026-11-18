from fastapi import APIRouter
from backend.app.services.momets import create_moment,get_moments,reply_to_moment
from backend.app.schemas.moments import ReplyToMomentRequest,MomentCreateRequest,MomentAndMessagesResponse
from backend.database.session import SessionDep
from backend.app.api.dependencies import CurrentUser
from backend.app.core.connections import connection_manager
from anyio import from_thread
from backend.app.services.chats import get_users_by_chat


moments_router=APIRouter(prefix='/chats/{chat_id}/moments',tags=["Моменты"])


@moments_router.post('',response_model=MomentAndMessagesResponse,status_code=201)
def create_endpoint_moment(session:SessionDep,user:CurrentUser,chat_id:int,data:MomentCreateRequest):
    card= create_moment(session, user, chat_id, data)

    currentuser,partner=get_users_by_chat(session, user, chat_id)
    event={
        'type':'moment.created',
        'card': MomentAndMessagesResponse.model_validate(card).model_dump(mode="json")
    }
    from_thread.run(
        connection_manager.send_to_user,
        currentuser,
        event
    )
    from_thread.run(
        connection_manager.send_to_user,
        partner,
        event
    )

    return card

@moments_router.get('',response_model=list[MomentAndMessagesResponse])
def get_endpoint_moments(session:SessionDep,user:CurrentUser,chat_id:int):
    return get_moments(session, user, chat_id)

@moments_router.post("/{moment_id}/reply",response_model=MomentAndMessagesResponse)
def reply_endpoint_to_moment(session:SessionDep,user:CurrentUser,chat_id:int,moment_id:int,data:ReplyToMomentRequest):
    card=reply_to_moment(session, user, chat_id, moment_id, data)

    currentuser, partner = get_users_by_chat(session, user, chat_id)

    event = {
        'type': 'moment.updated',
        'card': MomentAndMessagesResponse.model_validate(card).model_dump(mode="json")
    }

    from_thread.run(
        connection_manager.send_to_user,
        currentuser,
        event
    )
    from_thread.run(
        connection_manager.send_to_user,
        partner,
        event
    )
    return card