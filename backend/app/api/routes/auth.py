from fastapi import APIRouter
from backend.app.schemas.auth import RegisterRequest,RegisterResponse
from backend.app.services.auth import register_user
from backend.database.session import SessionDep
from backend.app.core.telegram_config import telegram_settings

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

