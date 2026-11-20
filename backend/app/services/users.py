from pydantic import TypeAdapter
from pydantic_extra_types.phone_numbers import PhoneNumber
from sqlalchemy.orm import Session
from backend.app.core.phones import is_phone_number, normalize_phone
from backend.app.models.users import Users
from backend.app.schemas.user import ProfileUpdateRequest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from psycopg.errors import UniqueViolation



phone_adapter=TypeAdapter(PhoneNumber)


def find_users(session:Session,query:str):
    query=query.strip()
    if query == "@":
        return []

    elif query.startswith('@'):
        username=query
        user=session.query(Users).filter(Users.username.startswith(username, autoescape=True)).order_by(Users.username).limit(20).all()

    elif is_phone_number(query):
        phone=phone_adapter.validate_python(normalize_phone(query))
        user=session.query(Users).filter(Users.phone==phone).all()

    else:
        return []

    return user

def update_profile(session:Session,user:Users,data:ProfileUpdateRequest):

    user=session.query(Users).filter(Users.id==user.id).first()
    if user is None:
        raise HTTPException(status_code=404,detail='Пользователь не найден')

    if data.username is not None:
        username_test="@"+data.username
        username=session.query(Users).filter(Users.username==username_test,Users.id != user.id,).first()
        if username is not None:
            raise HTTPException(status_code=409,detail="username уже занят")

    try:
        data_dump=data.model_dump(exclude_unset=True)
        for field,value in data_dump.items():
            if field=='username':
                user.username="@"+value
            else:
                setattr(user,field,value)

        session.commit()
        session.refresh(user)

    except IntegrityError as error:
        session.rollback()

        if isinstance(error.orig, UniqueViolation):
            raise HTTPException(
                status_code=409,
                detail="username уже занят",
            ) from error

        raise

    except SQLAlchemyError:
        session.rollback()
        raise
    return user
