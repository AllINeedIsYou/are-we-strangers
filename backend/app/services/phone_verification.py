from datetime import datetime,timedelta,timezone

from sqlalchemy.orm import Session
import phonenumbers
from backend.app.core.phones import normalize_phone
from backend.app.core.security import generate_token, hash_token, generate_verification_code, hash_verification_code, \
    verify_verification_code
from backend.app.models import Users,PhoneVerification
from fastapi import HTTPException


class PhoneVerificationError(Exception):
    pass

class VerificationCooldownError(Exception):
    pass

def create_phone_verification(session:Session, user:Users, expires_at: datetime):
    token=generate_token()
    token_hash=hash_token(token)

    new_phone_verification=PhoneVerification(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at
    )
    session.add(new_phone_verification)
    session.flush()

    return new_phone_verification,token

def get_active_phone_verification(session:Session,token:str):
    token_hash=hash_token(token)
    now=datetime.now(timezone.utc)

    query=session.query(PhoneVerification).filter(PhoneVerification.token_hash==token_hash,PhoneVerification.expires_at>now,PhoneVerification.used_at.is_(None),PhoneVerification.revoked_at.is_(None)).first()
    return query

def validate_phone_contact(session:Session,token:str,phone:str):
    query=get_active_phone_verification(session, token)
    if query is None:
        return None
    else:
        user=session.query(Users).filter(Users.id==query.user_id).first()
        if user is None:
            return None
        else:
            try:
                phone_tg=normalize_phone(phone)
                phone_bd=normalize_phone(user.phone)
            except phonenumbers.NumberParseException:
                return None
            if not phone_tg.startswith("+7") or phone_bd!=phone_tg:
                return None
            else:
                return query

def issue_phone_verification_code(session:Session,token:str,phone:str,telegram_user_id:int):
    query=validate_phone_contact(session, token, phone)
    if query is None:
        return None

    session.refresh(query,with_for_update=True)

    now=datetime.now(timezone.utc)
    if (query.used_at is None) and (query.revoked_at is None) and (query.expires_at>now):
        if (query.last_sent_at is not None) and (now< query.last_sent_at+timedelta(seconds=60)):
            raise VerificationCooldownError('Повторный код можно запросить через 60 секунд')

        code=generate_verification_code()
        code_hash=hash_verification_code(code)

        query.code_hash=code_hash
        query.telegram_user_id=telegram_user_id
        query.last_sent_at=now

        session.commit()
        return code
    else:
        return None

def verify_phone_code(session:Session,token:str,code:str):
    query=get_active_phone_verification(session, token)
    if query is None:
        raise PhoneVerificationError('Заявка не действительна')
    else:
        session.refresh(query,with_for_update=True)
        now = datetime.now(timezone.utc)
        if (query.used_at is not None) or (query.revoked_at is not None) or (query.expires_at <= now):
            raise PhoneVerificationError('Заявка не действительна')
        if query.code_hash is None:
            raise PhoneVerificationError('Сначала запроси код в Telegram')
        if query.attempts >= 5:
            raise PhoneVerificationError("Лимит попыток исчерпан")
        user = session.query(Users).filter(Users.id == query.user_id).first()
        now=datetime.now(timezone.utc)
        if user is None:
            raise PhoneVerificationError('Пользователь не найден')

        if verify_verification_code(code,query.code_hash):
            user.phone_verified_at=now
            query.used_at=now

        else:
            query.attempts+=1
            if query.attempts==5:
                query.revoked_at=now
            session.commit()
            raise PhoneVerificationError('Неверный код')

        session.commit()
        session.refresh(user)
        return user


