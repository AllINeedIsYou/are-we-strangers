from typing import Annotated

from fastapi import APIRouter, HTTPException, Response, Cookie
from backend.app.schemas.auth import RegisterRequest, RegisterResponse, VerifyPhoneRequest, PhoneVerificationResponse, \
    ResendPhoneVerificationRequest, LoginRequest, VerifyEmailRequest, EmailVerificationResponse
from backend.app.services.auth import register_user, resend_phone_verification,login_user
from backend.app.services.auth_sessions import revoke_auth_session
from backend.app.services.email_verification import verify_email_token, request_email_verification, \
    send_email_verification
from backend.database.session import SessionDep
from backend.app.core.telegram_config import telegram_settings
from backend.app.schemas.user import UserResponse
from backend.app.services.phone_verification import PhoneVerificationError,verify_phone_code
from backend.app.api.dependencies import CurrentUser
auth_router=APIRouter(prefix='/auth', tags=['Auth'])

@auth_router.post('/register',summary='Регистрация', response_model=RegisterResponse,status_code=201)
def register(session:SessionDep ,data:RegisterRequest):
    new_user, new_phone_verification,token=register_user(session=session,data=data)
    return RegisterResponse(
        user=new_user,
        verification_token=token,
        verification_expires_at=new_phone_verification.expires_at,
        telegram_url=(f"https://t.me/{telegram_settings.TELEGRAM_BOT_USERNAME}?start={token}")

    )
@auth_router.post('/verify-phone',summary='Потверждение номера', response_model=UserResponse)
def verify_phone(session:SessionDep,data:VerifyPhoneRequest):
    try:
        user=verify_phone_code(session,data.verification_token,data.code)
        return user

    except PhoneVerificationError as error:
        raise HTTPException(status_code=400,detail=str(error))

@auth_router.post('/resend-phone-verification', response_model=PhoneVerificationResponse, summary='Создать новую заявку')
def resend_verification(session:SessionDep,data:ResendPhoneVerificationRequest):
    new_create_verifi,token=resend_phone_verification(session=session,data=data)
    response=PhoneVerificationResponse(
        verification_token=token,
        verification_expires_at=new_create_verifi.expires_at,
        telegram_url=(f"https://t.me/{telegram_settings.TELEGRAM_BOT_USERNAME}?start={token}")
    )
    return response

@auth_router.post('/login',response_model=UserResponse,summary='Вход')
def login(session:SessionDep,data:LoginRequest,respone:Response):
    user,new_authsession,token=login_user(session, data)
    respone.set_cookie(
        key='session_token',
        value=token,
        httponly=True,
        max_age=30 * 24 * 60 * 60,
        samesite="lax",
        secure=False,
        path="/",
    )
    return user

@auth_router.get('/me',response_model=UserResponse)
def get_me_session(user:CurrentUser):
    return user

@auth_router.post('/logout',status_code=204)
def logout_session(session:SessionDep,response:Response,session_token:Annotated[str|None,Cookie()]=None):
    revoke_auth_session(session,session_token)
    response.delete_cookie(key="session_token", path="/")

@auth_router.post('/request-email-verification',response_model=EmailVerificationResponse,summary="Отправка письма потверждения почты")
def send_verification_email(session:SessionDep, user:CurrentUser):
    new_email_verif=request_email_verification(session=session,user=user)
    return EmailVerificationResponse(expires_at=new_email_verif.expires_at)

@auth_router.post('/verify-email', response_model=UserResponse, summary='Потверждение почты')
def verify_email(session:SessionDep,data:VerifyEmailRequest):
    return verify_email_token(session=session,token=data.token)


