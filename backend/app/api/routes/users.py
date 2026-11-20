from backend.database.session import SessionDep
from backend.app.api.dependencies import CurrentUser
from fastapi import APIRouter
from backend.app.schemas.user import PublicUserResponse,UserResponse,ProfileUpdateRequest
from backend.app.services.users import find_users,update_profile

user_router=APIRouter(prefix='/user', tags=['User'])

@user_router.get('/search', response_model=list[PublicUserResponse])
def find_user_by_query(session:SessionDep,q:str, user:CurrentUser):
    return find_users(session, q)

@user_router.patch('/me',response_model=UserResponse)
def update_enpoint_profile(session:SessionDep,user:CurrentUser,data:ProfileUpdateRequest):
    return update_profile(session, user, data)

