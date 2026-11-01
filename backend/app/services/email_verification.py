from datetime import datetime,timezone,timedelta
from urllib.parse import urlencode

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError

from backend.app.core.mail import send_email
from backend.app.core.mail_config import mail_settings
from backend.app.core.security import generate_token,hash_token
from backend.app.models import EmailVerification,Users
from sqlalchemy.orm import Session



def create_email_verification(session:Session, user:Users):
    token=generate_token()
    token_hash=hash_token(token)
    now=datetime.now(timezone.utc)

    new_email_verif=EmailVerification(
        user_id=user.id,
        email=user.email,
        token_hash=token_hash,
        expires_at=now+timedelta(minutes=15),
    )
    session.add(new_email_verif)
    session.flush()

    return  new_email_verif,token


def verify_email_token(session:Session,token:str):
    token_hash=hash_token(token)
    query=session.query(EmailVerification).filter(EmailVerification.token_hash==token_hash).with_for_update().first()
    now = datetime.now(timezone.utc)
    if (query is None) or (query.used_at!=None) or (query.revoked_at!=None) or (query.expires_at<=now):
        raise HTTPException(status_code=400, detail='Ссылка недействительна или срок её действия истёк')

    user = session.get(Users, query.user_id)
    if (user is None) or (user.email!=query.email):
        raise HTTPException(status_code=400)

    try:
        user.email_verified_at=now
        query.used_at=now
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        raise

    return user


def send_email_verification(to_email:str,token:str):
    query = urlencode({"token": token})
    verification_url = f"{mail_settings.EMAIL_VERIFICATION_URL}?{query}"

    subject='Подтверждение почты — Are we strangers?'
    text = (
        "Привет!\n\n"
        "Подтверди свою почту в Are we strangers? — перейди по ссылке:\n"
        f"{verification_url}\n\n"
        "Ссылка действует 15 минут и может быть использована только один раз.\n\n"
        "Если ты не запрашивал подтверждение, просто проигнорируй это письмо."
    )
    send_email(to_email=to_email,subject=subject,text=text)


def request_email_verification(session:Session,user:Users):
    try:
        session.refresh(user,with_for_update=True)
        if user.email_verified_at is not None:
            raise HTTPException(status_code=409, detail='Почта уже потверждена')

        now = datetime.now(timezone.utc)

        last_verification = session.query(EmailVerification).filter(EmailVerification.user_id==user.id).order_by(EmailVerification.created_at.desc()).first()
        if (last_verification is not None) and (now - last_verification.created_at < timedelta(seconds=60)):
            raise HTTPException(status_code=429,detail='Повторное письмо можно запросить через минуту')

        all_user_verification=session.query(EmailVerification).filter(EmailVerification.user_id==user.id,EmailVerification.used_at.is_(None),EmailVerification.revoked_at.is_(None)).all()
        for old in all_user_verification:
            old.revoked_at=now


        new_email_verif, token=create_email_verification(session, user)
        session.commit()

    except SQLAlchemyError:
        session.rollback()
        raise

    try:
        send_email_verification(new_email_verif.email,token)
    except OSError:
        raise HTTPException(status_code=502,detail='Не удалось отправить письмо. Попробуйте позже')

    return new_email_verif
