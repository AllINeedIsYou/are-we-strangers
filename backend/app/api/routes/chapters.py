from fastapi import APIRouter
from backend.app.services.chapters import create_chapter,get_chapters,decide_chapter
from backend.app.schemas.chapters import ChapterCreateRequest,ChapterResponse,ChapterDecisionRequest
from backend.database.session import SessionDep
from backend.app.api.dependencies import CurrentUser
from backend.app.core.connections import connection_manager
from anyio import from_thread
from backend.app.services.chats import get_users_by_chat

chapters_router=APIRouter(prefix='/chats/{chat_id}/chapters',tags=['Главы'])

@chapters_router.post('',response_model=ChapterResponse,status_code=201)
def create_endpoint_chapter(session:SessionDep,user:CurrentUser,chat_id:int,data:ChapterCreateRequest):
    new_chapters=create_chapter(session, user, chat_id, data)
    currentuser,partner=get_users_by_chat(session, user, chat_id)

    event={
        'type':'chapter.created',
        'chat_id':chat_id,
        'chapter_id':new_chapters.id
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

    return new_chapters

@chapters_router.get('',response_model=list[ChapterResponse])
def get_endpoint_chapters(session:SessionDep,user:CurrentUser,chat_id:int):
    chapters=get_chapters(session, user, chat_id)
    return chapters

@chapters_router.patch('/{chapter_id}',response_model=ChapterResponse)
def decide_endpoint_chapter(session:SessionDep,user:CurrentUser,chat_id:int,chapter_id:int,data:ChapterDecisionRequest):
    chapter=decide_chapter(session, user, chat_id, chapter_id, data)
    currentuser, partner = get_users_by_chat(session, user, chat_id)

    event = {
        'type': 'chapter.updated',
        'chat_id': chat_id,
        'chapter_id': chapter.id
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





    return chapter