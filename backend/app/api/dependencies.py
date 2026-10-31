from backend.database.session import SessionDep
from fastapi import Cookie,Depends
from typing import Annotated
from backend.app.models.users import Users
from backend.app.services.auth_sessions import get_user_by_session

def get_current_user(session:SessionDep,session_token:Annotated[str|None,Cookie()]=None):
    return get_user_by_session(session,session_token)

CurrentUser = Annotated[Users, Depends(get_current_user)]