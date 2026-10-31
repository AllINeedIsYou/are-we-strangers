from fastapi import APIRouter, HTTPException,Response
from backend.app.schemas.auth import RegisterRequest, RegisterResponse, VerifyPhoneRequest, PhoneVerificationResponse, \
    ResendPhoneVerificationRequest, LoginRequest
from backend.app.services.auth import register_user, resend_phone_verification,login_user
from backend.database.session import SessionDep
from backend.app.core.telegram_config import telegram_settings
from backend.app.schemas.user import UserResponse
from backend.app.services.phone_verification import PhoneVerificationError,verify_phone_code

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

