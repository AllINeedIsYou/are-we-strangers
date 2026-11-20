from fastapi import APIRouter
from backend.app.services.arhives import set_future_question_archived,set_moment_archived,set_chat_archived,get_user_archive
from backend.app.schemas.arhives import ArchiveResponse,ArchiveRequest,ArchiveChangeResponse
from backend.database.session import SessionDep
from backend.app.api.dependencies import CurrentUser
from backend.app.core.connections import connection_manager
from anyio import from_thread

archive_router=APIRouter(tags=['Архив'])


@archive_router.get('/archive',response_model=ArchiveResponse)
def get_endpoint_archive(session:SessionDep,user:CurrentUser):
    response=get_user_archive(session,user)
    return response

@archive_router.patch('/chats/{chat_id}/archive',response_model=ArchiveChangeResponse)
def set_endpoint_chat_archived(session:SessionDep,user:CurrentUser,chat_id:int,data:ArchiveRequest):
    response,changed=set_chat_archived(session, user, chat_id, data)

    if changed:
        event={
            'type':"archive.changed",
            **response.model_dump(mode='json')
        }
        from_thread.run(
            connection_manager.send_to_user,
            user.id,
            event
        )

    return response

@archive_router.patch('/chats/{chat_id}/moments/{moment_id}/archive',response_model=ArchiveChangeResponse)
def set_endpoint_chat_archived(session:SessionDep,user:CurrentUser,chat_id:int,moment_id:int,data:ArchiveRequest):
    response,changed=set_moment_archived(session, user, chat_id, moment_id, data)

    if changed:
        event={
            'type':"archive.changed",
            **response.model_dump(mode='json')
        }
        from_thread.run(
            connection_manager.send_to_user,
            user.id,
            event
        )

    return response

@archive_router.patch('/chats/{chat_id}/future-questions/{question_id}/archive',response_model=ArchiveChangeResponse)
def set_endpoint_chat_archived(session:SessionDep,user:CurrentUser,chat_id:int,question_id:int,data:ArchiveRequest):
    response,changed=set_future_question_archived(session, user, chat_id, question_id, data)

    if changed:
        event={
            'type':"archive.changed",
            **response.model_dump(mode='json')
        }
        from_thread.run(
            connection_manager.send_to_user,
            user.id,
            event
        )

    return response
