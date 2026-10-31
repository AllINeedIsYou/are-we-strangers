from sqlalchemy.orm import Session
from backend.app.core.security import generate_token,hash_token
from backend.app.models.users import Users
from backend.app.models.auth_sessions import AuthSession
from datetime import datetime,timedelta,timezone
from fastapi import HTTPException
def create_auth_session(session:Session, user:Users):
    token=generate_token()
    token_hash=hash_token(token)
    now=datetime.now(timezone.utc)

    new_authsession=AuthSession(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=now+timedelta(days=30),

    )
    session.add(new_authsession)
    session.flush()

    return new_authsession,token

def get_user_by_session(session:Session, token:str|None):
    if token is None:
        raise HTTPException(status_code=401, detail='Необходимо сначала войти в аккаунт')
    now=datetime.now(timezone.utc)
    token_hash=hash_token(token)

    query=session.query(AuthSession,Users).join(Users, AuthSession.user_id==Users.id).filter(AuthSession.token_hash==token_hash,AuthSession.expires_at>now,AuthSession.revoked_at.is_(None)).first()
    if query is None:
        raise HTTPException(status_code=401,detail='Пользователь или сессия не найдена')
    auth,user=query
    return user
