from sqlalchemy.orm import Session
from backend.app.models import ArchivedMoment,ArchivedFutureQuestion,ArchivedChat,Users,Chats,Moments,FutureQuestion
from backend.app.schemas.arhives import ArchiveChangeResponse,ArchiveRequest,ArchiveResponse
from backend.app.services.chats import get_chat_for_user
from sqlalchemy.exc import SQLAlchemyError,NoResultFound
from fastapi import HTTPException

def get_user_archive(session:Session,user:Users):

    chats=session.query(ArchivedChat).filter(ArchivedChat.user_id==user.id).order_by(ArchivedChat.archived_at.asc(),ArchivedChat.id.asc()).all()
    moments=session.query(ArchivedMoment).filter(ArchivedMoment.user_id==user.id).order_by(ArchivedMoment.archived_at.asc(),ArchivedMoment.id.asc()).all()
    futurequestions=session.query(ArchivedFutureQuestion).filter(ArchivedFutureQuestion.user_id==user.id).order_by(ArchivedFutureQuestion.archived_at.asc(),ArchivedFutureQuestion.id.asc()).all()

    chat_ids=[chat.chat_id for chat in chats]
    moment_ids=[moment.moment_id for moment in moments]
    question_ids=[futurequestion.futurequestion_id for futurequestion in futurequestions]

    return ArchiveResponse(
        chat_ids=chat_ids,
        moment_ids=moment_ids,
        question_ids=question_ids,
    )


def set_chat_archived(session:Session,user:Users,chat_id:int,data:ArchiveRequest):
    chat=get_chat_for_user(session, user, chat_id)


    try:
        chat=session.query(Chats).filter(Chats.id==chat_id).with_for_update().first()
        chat_arhive = session.query(ArchivedChat).filter(ArchivedChat.chat_id == chat.id,ArchivedChat.user_id == user.id).first()
        changed=True
        if data.archived:
            if chat_arhive is not None:
                changed = False
                response= ArchiveChangeResponse(
                    chat_id=chat_id,
                    item_type="chat",
                    item_id=chat_id,
                    archived=True
                )
                session.commit()
                return response,changed


            new_archived_chat=ArchivedChat(
                chat_id=chat.id,
                user_id=user.id
            )

            session.add(new_archived_chat)
            session.commit()
            response=ArchiveChangeResponse(
                chat_id=chat_id,
                item_type="chat",
                item_id=chat_id,
                archived=True
            )


        else:
            if chat_arhive is None:
                changed = False
                response= ArchiveChangeResponse(
                    chat_id=chat_id,
                    item_type="chat",
                    item_id=chat_id,
                    archived=False
                )
                session.commit()
                return response,changed


            session.delete(chat_arhive)
            session.commit()
            response = ArchiveChangeResponse(
                chat_id=chat_id,
                item_type="chat",
                item_id=chat_id,
                archived=False
            )

    except SQLAlchemyError:
        session.rollback()
        raise

    return response, changed


def set_moment_archived(session:Session,user:Users,chat_id:int,moment_id:int,data:ArchiveRequest):
    chat=get_chat_for_user(session, user, chat_id)


    try:
        moment=session.query(Moments).filter(Moments.id==moment_id,Moments.chat_id==chat_id).with_for_update().one()
        moment_arhiv = session.query(ArchivedMoment).filter(ArchivedMoment.moment_id == moment_id,ArchivedMoment.user_id == user.id).first()
        changed=True
        if data.archived:
            if moment_arhiv is not None:
                changed = False
                response= ArchiveChangeResponse(
                    chat_id=chat_id,
                    item_type="moment",
                    item_id=moment_id,
                    archived=True
                )
                session.commit()
                return response,changed


            new_moment_arhiv=ArchivedMoment(
                moment_id=moment_id,
                user_id=user.id
            )

            session.add(new_moment_arhiv)
            session.commit()
            response=ArchiveChangeResponse(
                chat_id=chat_id,
                item_type="moment",
                item_id=moment_id,
                archived=True
            )


        else:
            if moment_arhiv is None:
                changed = False
                response= ArchiveChangeResponse(
                    chat_id=chat_id,
                    item_type="moment",
                    item_id=moment_id,
                    archived=False
                )
                session.commit()
                return response,changed


            session.delete(moment_arhiv)
            session.commit()
            response = ArchiveChangeResponse(
                chat_id=chat_id,
                item_type="moment",
                item_id=moment_id,
                archived=False
            )

    except NoResultFound:
        session.rollback()
        raise HTTPException(status_code=404,detail="Момент не найден")

    except SQLAlchemyError:
        session.rollback()
        raise

    return response, changed


def set_future_question_archived(session:Session,user:Users,chat_id:int,question_id:int,data:ArchiveRequest):
    chat = get_chat_for_user(session, user, chat_id)

    try:
        question= session.query(FutureQuestion).filter(FutureQuestion.id == question_id,FutureQuestion.chat_id==chat_id).with_for_update().one()
        question_arhiv = session.query(ArchivedFutureQuestion).filter(ArchivedFutureQuestion.futurequestion_id == question_id,ArchivedFutureQuestion.user_id == user.id).first()
        changed = True
        if data.archived:
            if question_arhiv is not None:
                changed = False
                response = ArchiveChangeResponse(
                    chat_id=chat_id,
                    item_type="question",
                    item_id=question_id,
                    archived=True
                )
                session.commit()
                return response, changed

            new_archived_chat = ArchivedFutureQuestion(
                futurequestion_id=question_id,
                user_id=user.id
            )

            session.add(new_archived_chat)
            session.commit()
            response = ArchiveChangeResponse(
                chat_id=chat_id,
                item_type="question",
                item_id=question_id,
                archived=True
            )


        else:
            if question_arhiv is None:
                changed = False
                response = ArchiveChangeResponse(
                    chat_id=chat_id,
                    item_type="question",
                    item_id=question_id,
                    archived=False
                )
                session.commit()
                return response, changed

            session.delete(question_arhiv)
            session.commit()
            response = ArchiveChangeResponse(
                chat_id=chat_id,
                item_type="question",
                item_id=question_id,
                archived=False
            )

    except NoResultFound:
        session.rollback()
        raise HTTPException(status_code=404,detail="Вопрос не найден")

    except SQLAlchemyError:
        session.rollback()
        raise


    return response, changed