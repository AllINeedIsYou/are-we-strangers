from fastapi import APIRouter
from backend.app.schemas.auth import RegisterRequest

auth_router=APIRouter(prefix='/auth', tags=['Auth'])

@auth_router.post('/register',summary='Регистрация')
def register(data:RegisterRequest):
    data_dumb=data.model_dump(exclude={'password'})
    return data_dumb