from datetime import datetime,timezone,timedelta
from email.mime import application

from phonenumbers import NumberParseException
from fastapi import HTTPException
from psycopg.errors import UniqueViolation
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from backend.app.core.phones import normalize_phone
from backend.app.core.security import generate_token, hash_token, generate_verification_code, hash_verification_code, \
    verify_verification_code
from backend.app.models import Users, AuthSession, EmailChanges, EmailVerification, PasswordReset
from sqlalchemy.orm import Session
from backend.app.schemas.email_change import EmailChangeConfirmRequest,EmailChangeRequest
from backend.app.services.phone_verification import VerificationCooldownError


def create_email_change(session:Session,user:Users,data:EmailChangeRequest):
    token=generate_token()
    token_hash=hash_token(token)
    now=datetime.now(timezone.utc)

    new_emailchanges=EmailChanges(
        user_id=user.id,
        old_email=user.email,
        new_email=data.new_email,
        phone=normalize_phone(user.phone),
        token_hash=token_hash,
        expires_at=now+timedelta(minutes=10)
    )

    session.add(new_emailchanges)
    session.flush()

    return new_emailchanges,token


def request_email_change(session:Session,user:Users,data:EmailChangeRequest):
    try:
        session.refresh(user,with_for_update=True)
        now=datetime.now(timezone.utc)

        if user.phone_verified_at is None:
            raise HTTPException(status_code=403,detail="Потвердите номер телефона")
        if user.email==data.new_email:
            raise HTTPException(status_code=409,detail="Почта должна отличаться")

        find_user_with_this_email=session.query(Users).filter(Users.email==data.new_email).first()
        if find_user_with_this_email is not None:
            raise HTTPException(status_code=409,detail="Данная почта уже занята")

        last_request=session.query(EmailChanges).filter(EmailChanges.user_id==user.id).order_by(EmailChanges.created_at.desc()).first()
        if (last_request is not None) and (now-last_request.created_at<timedelta(minutes=1)):
            raise HTTPException(status_code=429,detail="Повторную заявку можно создать через 60 секунд.")

        all_last_request=session.query(EmailChanges).filter(EmailChanges.user_id==user.id,EmailChanges.revoked_at.is_(None),EmailChanges.used_at.is_(None)).all()

        for request in all_last_request:
            request.revoked_at=now

        new_emailchanges, token=create_email_change(session, user, data)

        session.commit()
    except (HTTPException,SQLAlchemyError):
        session.rollback()
        raise


    return new_emailchanges, token


def get_active_email_change(session:Session,token:str):
    token_hash=hash_token(token)
    now=datetime.now(timezone.utc)

    query=session.query(EmailChanges).filter(EmailChanges.token_hash==token_hash,EmailChanges.revoked_at.is_(None),EmailChanges.used_at.is_(None),EmailChanges.expires_at>now).first()
    return query

def issue_email_change_code(session:Session,token:str,phone:str,telegram_user_id:int):
    try:
        query=get_active_email_change(session, token)
        if query is None:
            session.rollback()
            return None

        application_id=query.id

        user=session.get(Users,query.user_id,with_for_update=True,populate_existing=True)
        application=session.query(EmailChanges).filter(EmailChanges.id==application_id).with_for_update().populate_existing().first()

        now=datetime.now(timezone.utc)

        if user is None or application is None:
            session.rollback()
            return None
        try:
            phone_application=normalize_phone(application.phone)
            phone_user=normalize_phone(user.phone)
            phone_telegram=normalize_phone(phone)
        except NumberParseException:
            session.rollback()
            return None
        if (application.expires_at<=now) or (application.revoked_at is not None) or (application.used_at is not None) or (application.attempts>=5) or (user.phone_verified_at is None) or (user.email!=application.old_email) or (phone_application!=phone_user) or (phone_telegram!=phone_application):
            session.rollback()
            return None

        if (application.telegram_user_id is not None) and (application.telegram_user_id!=telegram_user_id):
            session.rollback()
            return None

        if (application.last_sent_at is not None) and (now-application.last_sent_at<timedelta(minutes=1)):
            raise VerificationCooldownError("Повторный код можно запросить через 60 секунд")

        code=generate_verification_code()
        code_hash=hash_verification_code(code)

        application.telegram_user_id=telegram_user_id
        application.code_hash=code_hash
        application.last_sent_at=now

        session.commit()

    except(VerificationCooldownError,HTTPException,SQLAlchemyError):
        session.rollback()
        raise
    return code

def confirm_email_change(session:Session,user:Users,data:EmailChangeConfirmRequest):
    try:
        token_hash = hash_token(data.verification_token)

        session.refresh(user,with_for_update=True)
        application=session.query(EmailChanges).filter(EmailChanges.token_hash==token_hash,EmailChanges.user_id==user.id).with_for_update().populate_existing().first()

        now=datetime.now(timezone.utc)
        if application is None:
            raise HTTPException(status_code=400)
        application_id = application.id

        try:
            phone_application = normalize_phone(application.phone)
            phone_user = normalize_phone(user.phone)
        except NumberParseException:
            session.rollback()
            raise HTTPException(400, detail="Заявка недействительна")

        if (application.expires_at <= now) or (application.revoked_at is not None) or (application.used_at is not None) or (application.attempts >= 5) or (user.phone_verified_at is None) or (user.email != application.old_email) or (phone_application != phone_user):
            raise HTTPException(status_code=400)

        if (application.code_hash is None) or (application.telegram_user_id is None):
            raise HTTPException(status_code=400)

        if not verify_verification_code(data.code,application.code_hash):
            application.attempts+=1
            if application.attempts>=5:
                application.revoked_at=now
            session.commit()
            raise HTTPException(status_code=400,detail="Неверный код")

        new_email_user=session.query(Users).filter(Users.email==application.new_email).first()
        if new_email_user is not None:
            raise HTTPException(status_code=409,detail="Почта занята")

        user.email=application.new_email
        application.used_at=now
        user.email_verified_at=None

        other_application=session.query(EmailChanges).filter(EmailChanges.id!=application_id,EmailChanges.user_id==user.id,EmailChanges.revoked_at.is_(None),EmailChanges.used_at.is_(None)).all()
        for application in other_application:
            application.revoked_at=now

        other_emailverification=session.query(EmailVerification).filter(EmailVerification.user_id==user.id, EmailVerification.revoked_at.is_(None),EmailVerification.used_at.is_(None)).all()
        for emailverification in other_emailverification:
            emailverification.revoked_at=now

        other_passwordreset=session.query(PasswordReset).filter(PasswordReset.user_id==user.id, PasswordReset.revoked_at.is_(None),PasswordReset.used_at.is_(None)).all()
        for passwordreset in other_passwordreset:
            passwordreset.revoked_at=now
        session.commit()
    except IntegrityError as error:
        session.rollback()
        if isinstance(error.orig,UniqueViolation):
            raise HTTPException(status_code=409,detail="Почта уже занята")
        raise
    except (SQLAlchemyError,HTTPException):
        session.rollback()
        raise

    return user


