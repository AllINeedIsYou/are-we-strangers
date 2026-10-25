from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr
from pydantic_extra_types.phone_numbers import PhoneNumber


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:int
    phone:PhoneNumber
    email:EmailStr
    name:str
    username:str
    created_at:datetime
    phone_verified_at:datetime|None=None
    email_verified_at:datetime|None=None