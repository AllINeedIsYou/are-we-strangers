from fastapi import APIRouter
from backend.app.schemas.auth import RegisterRequest,UserResponse
from backend.app.services.auth import register_user
from backend.database.session import SessionDep

auth_router=APIRouter(prefix='/auth', tags=['Auth'])

@auth_router.post('/register',summary='Регистрация', response_model=UserResponse,status_code=201)
def register(session:SessionDep ,data:RegisterRequest):
    return register_user(session=session,data=data)
