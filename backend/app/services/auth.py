from sqlalchemy.exc import IntegrityError

from backend.app.core.security import hash_password,verify_password
from backend.app.schemas.auth import RegisterRequest
from backend.app.models.users import Users
from sqlalchemy.orm import Session
from fastapi import HTTPException
from psycopg.errors import UniqueViolation

def register_user(session:Session, data:RegisterRequest):
    data_dumb=data.model_dump(exclude={'password'})

    try:
        password=data.password
        password_hash=hash_password(password)
        new_user=Users(**data_dumb,password_hash=password_hash)

        session.add(new_user)
        session.commit()
    except IntegrityError as error:
        session.rollback()

        if isinstance(error.orig,UniqueViolation):
            raise HTTPException(status_code=409,detail='username,телефон или почта уже заняты')

        raise
    session.refresh(new_user)
    return new_user