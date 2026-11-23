from pydantic import BaseModel, Field, ConfigDict,EmailStr
from datetime import datetime



class EmailChangeRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    new_email:EmailStr

class EmailChangeChallengeResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')

    verification_token:str
    verification_expires_at:datetime
    telegram_url:str

class EmailChangeConfirmRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    verification_token: str
    code:str=Field(pattern=r"^[0-9]{6}$", min_length=6,max_length=6)