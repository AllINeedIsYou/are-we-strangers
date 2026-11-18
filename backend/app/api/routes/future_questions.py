from fastapi import APIRouter,HTTPException
from backend.app.services.future_questions import get_future_questions,create_future_question,answer_future_question
from backend.app.schemas.future_questions import FutureQuestionResponse,FutureQuestionAnswerRequest,FutureQuestionRequest
from backend.database.session import SessionDep
from backend.app.api.dependencies import CurrentUser
from backend.app.core.connections import connection_manager
from anyio import from_thread
from backend.app.services.chats import get_users_by_chat


future_questions_router=APIRouter(prefix='/chats/{chat_id}/future-questions',tags=["Вопросы в будущее"])


@future_questions_router.post('',response_model=FutureQuestionResponse,status_code=201)
def create_endpoint_future_question(session:SessionDep,user:CurrentUser,chat_id:int,data:FutureQuestionRequest):
    new_question=create_future_question(session, user, chat_id, data)

    currentuser, partner = get_users_by_chat(session, user, chat_id)
    event={
        'type':'future_question.created',
        "chat_id":chat_id,
        "question_id":new_question.id
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
    return new_question

@future_questions_router.get('',response_model=list[FutureQuestionResponse])
def get_endpoint_future_questions(session:SessionDep,user:CurrentUser,chat_id:int):
    return get_future_questions(session, user, chat_id)

@future_questions_router.post('/{question_id}/answer',response_model=FutureQuestionResponse)
def answer_endpoint_future_question(session:SessionDep,user:CurrentUser,chat_id:int,question_id:int,data:FutureQuestionAnswerRequest):
    result=answer_future_question(session, user, chat_id, question_id, data)
    cards=get_future_questions(session, user, chat_id)
    for card in cards:
        if card.id==question_id:
            currentuser, partner = get_users_by_chat(session, user, chat_id)
            event = {
                'type': 'future_question.updated',
                "chat_id": chat_id,
                "question_id": question_id
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
    raise HTTPException(status_code=404,detail='Вопрос не найден')
