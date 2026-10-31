from pydantic import BaseModel, EmailStr, Field, field_validator
from pydantic_extra_types.phone_numbers import PhoneNumber
from datetime import datetime
from backend.app.schemas.user import UserResponse
from backend.app.core.phones import is_phone_number


class RegisterRequest(BaseModel):

    phone:PhoneNumber=Field(min_length=1)
    email:EmailStr=Field(min_length=1)
    name:str=Field(min_length=1,max_length=40)
    username:str=Field(min_length=1,max_length=31)
    password:str=Field(min_length=1)

    @field_validator('name')
    @classmethod
    def strip_whitespace(cls,value:str):
        value=value.strip()
        if not value:
            raise ValueError('Поле не может состоять только из пробелов')
        return value

    @field_validator('username')
    @classmethod
    def valid_username(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError('Поле не может состоять только из пробелов')
        if "@" in value:
            raise ValueError("Введи юзернейм без @ — система добавит его сама")
        if is_phone_number(value):
            raise ValueError("username не может быть номером телефона")
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

class VerifyPhoneRequest(BaseModel):
    code:str=Field(min_length=6, max_length=6,pattern=r"^[0-9]{6}$")
    verification_token:str=Field(min_length=1)

class ResendPhoneVerificationRequest(BaseModel):
    phone:PhoneNumber
    password:str=Field(min_length=1)

class PhoneVerificationResponse(BaseModel):
    verification_token:str
    verification_expires_at:datetime
    telegram_url:str

class LoginRequest(BaseModel):
    login: str = Field(min_length=1)
    password: str = Field(min_length=1)
    @field_validator('login')
    @classmethod
    def valid_login(cls,value:str):
        value=value.strip()
        if not value:
            raise ValueError('Поле не может состоять только из пробелов')
        return value
