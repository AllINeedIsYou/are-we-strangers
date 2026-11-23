from backend.app.core.telegram_config import telegram_settings
from backend.app.schemas.email_change import EmailChangeChallengeResponse, EmailChangeRequest, EmailChangeConfirmRequest
from backend.database.session import SessionDep
from backend.app.api.dependencies import CurrentUser
from fastapi import APIRouter
from backend.app.schemas.user import PublicUserResponse,UserResponse,ProfileUpdateRequest
from backend.app.services.users import find_users,update_profile
from backend.app.services.email_change import request_email_change,confirm_email_change

user_router=APIRouter(prefix='/user', tags=['User'])

@user_router.get('/search', response_model=list[PublicUserResponse])
def find_user_by_query(session:SessionDep,q:str, user:CurrentUser):
    return find_users(session, q)

@user_router.patch('/me',response_model=UserResponse)
def update_enpoint_profile(session:SessionDep,user:CurrentUser,data:ProfileUpdateRequest):
    return update_profile(session, user, data)

@user_router.post('/me/email-change',response_model=EmailChangeChallengeResponse,status_code=201)
def request_endpoint_email_change(session:SessionDep,user:CurrentUser,data:EmailChangeRequest):
    new_emailchanges, token=request_email_change(session, user, data)
    response=EmailChangeChallengeResponse(
        verification_token=token,
        verification_expires_at=new_emailchanges.expires_at,
        telegram_url=f'https://t.me/{telegram_settings.TELEGRAM_BOT_USERNAME}?start=email_{token}'

    )
    return response

@user_router.post('/me/email-change/confirm',response_model=UserResponse)
def confirm_endpoint_email_change(session:SessionDep,user:CurrentUser,data:EmailChangeConfirmRequest):
    user=confirm_email_change(session, user, data)
    return user