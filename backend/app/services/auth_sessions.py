from sqlalchemy.orm import Session
from backend.app.core.security import generate_token,hash_token
from backend.app.models.users import Users
from backend.app.models.auth_sessions import AuthSession
from datetime import datetime,timedelta,timezone
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

