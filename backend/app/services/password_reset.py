import logging
from datetime import datetime,timezone,timedelta
from urllib.parse import urlencode
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from backend.app.core.mail import send_email
from backend.app.core.mail_config import mail_settings
from backend.app.core.security import generate_token, hash_token, hash_password,verify_password
from backend.app.models import Users,PasswordReset,AuthSession
from sqlalchemy.orm import Session
from backend.app.schemas.password_reset import PasswordResetConfirmRequest


def create_password_reset(session:Session,user:Users):
    token=generate_token()
    token_hash=hash_token(token)
    now=datetime.now(timezone.utc)

    new_password_reset=PasswordReset(
        user_id=user.id,
        email=user.email,
        token_hash=token_hash,
        expires_at=now+timedelta(minutes=15)
    )
    session.add(new_password_reset)
    session.flush()

    return new_password_reset,token

def request_password_reset(session: Session, email: str):
    try:
        user=session.query(Users).filter(Users.email==email).with_for_update().first()
        if user is None:
            session.commit()
            return None

        if user.email_verified_at is None:
            session.commit()
            return None

        now=datetime.now(timezone.utc)
        last_application=session.query(PasswordReset).filter(PasswordReset.user_id==user.id).order_by(PasswordReset.created_at.desc()).first()

        if (last_application is not None) and  (now-last_application.created_at<timedelta(minutes=1)):
            session.commit()
            return None

        revoke_last_applications=session.query(PasswordReset).filter(PasswordReset.user_id==user.id,PasswordReset.used_at.is_(None),PasswordReset.revoked_at.is_(None)).all()
        for applications in revoke_last_applications:
            applications.revoked_at=now

        new_password_reset, token=create_password_reset(session, user)
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        raise

    return new_password_reset, token

def send_email_password_reset(to_email:str,token:str):
    query = urlencode({"token": token})
    url_with_token = f"{mail_settings.PASSWORD_RESET_URL}?{query}"

    subject = 'Смена пароля — Are we strangers?'
    text = (
        "Привет!\n\n"
        "Смени пароль в Are we strangers? — перейдя по ссылке:\n"
        f"{url_with_token}\n\n"
        "Ссылка действует 15 минут и может быть использована только один раз.\n\n"
        "Если ты не запрашивал смену пароля, просто проигнорируй это письмо."
    )
    send_email(to_email=to_email, subject=subject, text=text)

def verify_token_for_reset_password(session:Session,data:PasswordResetConfirmRequest):
    try:
        token_hash=hash_token(data.token)
        invalid_link='Ссылка недействительна или срок её действия истёк'

        user_id=session.query(PasswordReset.user_id).filter(PasswordReset.token_hash==token_hash).scalar()
        if user_id is None:
            raise HTTPException(status_code=400, detail=invalid_link)

        user=session.query(Users).filter(Users.id==user_id).with_for_update().populate_existing().first()

        query=session.query(PasswordReset).filter(PasswordReset.token_hash==token_hash).with_for_update().populate_existing().first()

        now = datetime.now(timezone.utc)

        if (user is None)or (query is None) or (user.email!=query.email) or (user.email_verified_at is None) or (query.used_at!=None) or (query.revoked_at!=None) or (query.expires_at<=now):
            raise HTTPException(status_code=400, detail=invalid_link)

        if verify_password(data.new_password, user.password_hash):
            raise HTTPException(status_code=400,detail="Пароль должен отличаться от изначального")

        user.password_hash=hash_password(data.new_password)
        query.used_at=now

        other_requests = session.query(PasswordReset).filter(PasswordReset.user_id == user.id,PasswordReset.id!=query.id,PasswordReset.used_at.is_(None),PasswordReset.revoked_at.is_(None)).all()
        for requests in other_requests:
            requests.revoked_at = now

        active_sessions=session.query(AuthSession).filter(AuthSession.user_id==user.id,AuthSession.revoked_at.is_(None)).all()
        for active_session in active_sessions:
            active_session.revoked_at=now


        session.commit()

    except (HTTPException,SQLAlchemyError):
        session.rollback()
        raise
    return user_id


logger = logging.getLogger(__name__)

def send_password_reset_email_safely(to_email: str, token: str):
    try:
        send_email_password_reset(to_email, token)
    except OSError:
        logger.exception(
            "Не удалось отправить письмо для смены пароля"
        )




