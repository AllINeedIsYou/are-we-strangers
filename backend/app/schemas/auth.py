from datetime import datetime

from pydantic import BaseModel, EmailStr, ConfigDict
from pydantic_extra_types.phone_numbers import PhoneNumber

class RegisterRequest(BaseModel):
    phone:PhoneNumber
    email:EmailStr
    name:str
    username:str
    password:str

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:int
    phone:PhoneNumber
    email:EmailStr
    name:str
    username:str
    created_at:datetime