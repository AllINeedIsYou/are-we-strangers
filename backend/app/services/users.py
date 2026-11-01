from pydantic import TypeAdapter
from pydantic_extra_types.phone_numbers import PhoneNumber
from sqlalchemy.orm import Session
from backend.app.core.phones import is_phone_number, normalize_phone
from backend.app.models.users import Users



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
