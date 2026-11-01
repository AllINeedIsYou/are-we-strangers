from backend.database.session import SessionDep
from backend.app.api.dependencies import CurrentUser
from fastapi import APIRouter
from backend.app.schemas.user import PublicUserResponse
from backend.app.services.users import find_users

user_router=APIRouter(prefix='/user', tags=['User'])

@user_router.get('/search', response_model=list[PublicUserResponse])
def find_user_by_query(session:SessionDep,q:str, user:CurrentUser):
    return find_users(session, q)


