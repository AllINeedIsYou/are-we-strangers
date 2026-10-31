from datetime import datetime,timezone,timedelta

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from pydantic import TypeAdapter, EmailStr, ValidationError
from pydantic_extra_types.phone_numbers import PhoneNumber
from backend.app.core.phones import is_phone_number, normalize_phone

from backend.app.core.security import hash_password, verify_password, hash_verification_code
from backend.app.models import PhoneVerification
from backend.app.schemas.auth import RegisterRequest, ResendPhoneVerificationRequest, LoginRequest
from backend.app.models.users import Users
from sqlalchemy.orm import Session
from fastapi import HTTPException
from psycopg.errors import UniqueViolation

from backend.app.services.auth_sessions import create_auth_session
from backend.app.services.phone_verification import create_phone_verification


def register_user(session:Session, data:RegisterRequest):
    data_dumb=data.model_dump(exclude={'password','username'})

    try:
        password=data.password
        password_hash=hash_password(password)

        new_user=Users(**data_dumb,password_hash=password_hash,username="@"+data.username)
        expires_at= datetime.now(timezone.utc)+timedelta(minutes=10)
        session.add(new_user)
        session.flush()
        new_phone_verification,token=create_phone_verification(session=session,user=new_user,expires_at=expires_at)
        session.commit()
    except IntegrityError as error:
        session.rollback()

        if isinstance(error.orig,UniqueViolation):
            raise HTTPException(status_code=409,detail='username,телефон или почта уже заняты')

        raise
    session.refresh(new_user)
    session.refresh(new_phone_verification)
    return new_user, new_phone_verification,token


def resend_phone_verification(session:Session,data:ResendPhoneVerificationRequest):
    user=session.query(Users).filter(Users.phone==data.phone).first()

    if (user is None) or (verify_password(data.password,user.password_hash)!=True):
        raise HTTPException(status_code=401, detail='Неверный номер телефона или пароль')
    if user.phone_verified_at is not None:
        raise HTTPException(status_code=409, detail='Номер телефона уже подтверждён')
    now=datetime.now(timezone.utc)
    old_phon_apli=session.query(PhoneVerification).filter(PhoneVerification.user_id==user.id, PhoneVerification.used_at.is_(None), PhoneVerification.revoked_at.is_(None) ).all()
    for old in old_phon_apli:
        old.revoked_at=now

    new_create_verifi,token=create_phone_verification(session=session,user=user,expires_at=now+timedelta(minutes=10))

    session.commit()
    session.refresh(new_create_verifi)

    return new_create_verifi,token


email_adapter = TypeAdapter(EmailStr)
phone_adapter = TypeAdapter(PhoneNumber)

def find_user_by_login(session:Session,login:str)->Users|None:
    try:
        if login[0]=='@':
            user=session.query(Users).filter(Users.username==login).first()

        elif '@' in login and login[0]!='@':
            email=email_adapter.validate_python(login)
            user = session.query(Users).filter(Users.email == email).first()

        elif is_phone_number(login):
            phone=phone_adapter.validate_python(normalize_phone(login))
            user = session.query(Users).filter(Users.phone == phone).first()

        else:
            return None

    except ValidationError:
        return None

    return user

def authenticate_user(session:Session,data:LoginRequest):
    user=find_user_by_login(session=session,login=data.login)
    if (user is None) or (verify_password(data.password,user.password_hash)==False):
        raise HTTPException(status_code=401, detail='Неверный логин или пароль')

    if user.phone_verified_at is None:
        raise HTTPException(status_code=403, detail='Сначала потвердите номер телефона')

    return user

def login_user(session:Session,data:LoginRequest):
    user=authenticate_user(session, data)
    try:
        new_authsession,token=create_auth_session(session, user)
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        raise

    return user,new_authsession,token

