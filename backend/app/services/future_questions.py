from datetime import datetime,timezone
from sqlalchemy.orm import Session
from backend.app.models import Users,FutureQuestionAnswer,FutureQuestion
from backend.app.schemas.future_questions import FutureQuestionAnswerRequest, FutureQuestionRequest, \
    FutureQuestionResponse
from backend.app.services.chats import get_chat_for_user
from fastapi import HTTPException
from psycopg.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError, SQLAlchemyError


def create_future_question(session:Session,user:Users,chat_id:int,data:FutureQuestionRequest):
    chat=get_chat_for_user(session, user, chat_id)
    now=datetime.now(timezone.utc)
    if data.opens_at<=now:
        raise HTTPException(status_code=422,detail="Неккоректное время")

    try:
        new_question=FutureQuestion(
            chat_id=chat.id,
            author_id=user.id,
            text=data.text,
            opens_at=data.opens_at
        )
        session.add(new_question)
        session.commit()

    except SQLAlchemyError:
        session.rollback()
        raise

    return new_question

def answer_future_question(session:Session,user:Users,chat_id:int,question_id:int,data:FutureQuestionAnswerRequest):
    chat = get_chat_for_user(session, user, chat_id)
    now = datetime.now(timezone.utc)

    question=session.query(FutureQuestion).filter(FutureQuestion.chat_id==chat_id,FutureQuestion.id==question_id).first()
    if question is None:
        raise HTTPException(status_code=404,detail="Вопрос не найден")
    if question.opens_at>now:
        raise HTTPException(status_code=409, detail="Вопрос ещё не открылся")
    try:
        new_question_answer=FutureQuestionAnswer(
            question_id=question.id,
            user_id=user.id,
            text=data.text
        )
        session.add(new_question_answer)
        session.commit()

    except IntegrityError as error:
        session.rollback()
        if isinstance(error.orig,UniqueViolation) and error.orig.diag.constraint_name=='uq_futurequestionanswer':
            raise HTTPException(status_code=409,detail="Ты уже ответил на этот вопрос")
        raise

    except SQLAlchemyError:
        session.rollback()
        raise

    return new_question_answer

def get_future_questions(session:Session,user:Users,chat_id:int):
    chat=get_chat_for_user(session, user, chat_id)
    questions=session.query(FutureQuestion).filter(FutureQuestion.chat_id==chat_id).order_by(FutureQuestion.created_at.desc()).all()
    if questions==[]:
        return questions

    questions_ids=[question.id for question in questions]
    question_aswers=session.query(FutureQuestionAnswer).filter(FutureQuestionAnswer.question_id.in_(questions_ids)).all()

    answers_by_question = {}

    for answer in question_aswers:
        answers=answers_by_question.setdefault(answer.question_id,{})
        answers[answer.user_id]=answer.text

    partner_id = chat.second_user_id if chat.first_user_id == user.id else chat.first_user_id

    result=[]

    for question in questions:
        answers = answers_by_question.get(question.id, {})
        card = FutureQuestionResponse.model_validate(question)
        card.my_answer = answers.get(user.id)

        if card.my_answer is not None:
            card.partner_answer = answers.get(partner_id)

        result.append(card)

    return result
    




