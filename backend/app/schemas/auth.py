from pydantic import BaseModel, EmailStr, Field, field_validator
from pydantic_extra_types.phone_numbers import PhoneNumber
from datetime import datetime
from backend.app.schemas.user import UserResponse


class RegisterRequest(BaseModel):

    phone:PhoneNumber=Field(min_length=1)
    email:EmailStr=Field(min_length=1)
    name:str=Field(min_length=1,max_length=40)
    username:str=Field(min_length=1,max_length=32)
    password:str=Field(min_length=1)

    @field_validator('name','username')
    @classmethod
    def strip_whitespace(cls,value:str):
        value=value.strip()
        if not value:
            raise ValueError('Поле не может состоять только из пробелов')
        return value

    @field_validator('password')
    @classmethod
    def validate_password(cls,value:str):
        if ' ' in value:
            raise ValueError('Пароль не должен содержать пробелы')
        return value

class RegisterResponse(BaseModel):
    user:UserResponse
    verification_token:str
    verification_expires_at:datetime
    telegram_url: str

