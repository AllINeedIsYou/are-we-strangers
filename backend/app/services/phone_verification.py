from datetime import datetime,timedelta,timezone

from sqlalchemy.orm import Session
from backend.app.core.security import generate_token,hash_token
from backend.app.models import Users,PhoneVerification


def create_phone_verification(session:Session, user:Users, expires_at: datetime):
    token=generate_token()
    token_hash=hash_token(token)

    new_phone_verification=PhoneVerification(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at
    )
    session.add(new_phone_verification)
    session.flush()

    return new_phone_verification,token

def get_active_phone_verification(session:Session,token:str):
    token_hash=hash_token(token)
    now=datetime.now(timezone.utc)

    query=session.query(PhoneVerification).filter(PhoneVerification.token_hash==token_hash,PhoneVerification.expires_at>now,PhoneVerification.used_at.is_(None),PhoneVerification.revoked_at.is_(None)).first()
    return query