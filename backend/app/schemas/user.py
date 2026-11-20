from datetime import datetime, date
from backend.app.core.phones import is_phone_number
from pydantic import BaseModel, ConfigDict, EmailStr,field_validator,Field
from pydantic_extra_types.phone_numbers import PhoneNumber


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:int
    phone:PhoneNumber
    email:EmailStr
    name:str
    username:str
    bio: str|None
    birthday:date|None
    created_at:datetime
    phone_verified_at:datetime|None=None
    email_verified_at:datetime|None=None

class PublicUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:int
    name:str
    username:str
    bio:str|None
    birthday:date|None


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


    name:str|None=Field(max_length=40,min_length=1,default=None)
    username:str|None=Field(max_length=31,min_length=1,default=None)
    bio:str|None=Field(max_length=500,min_length=1,default=None)
    birthday:date|None=None

    @field_validator("birthday")
    @classmethod
    def validate_birthday(cls, value: date | None):
        if value is not None and value > date.today():
            raise ValueError("Дата рождения не может быть в будущем")
        return value

    @field_validator('username',mode='before')
    @classmethod
    def valid_username(cls,value):
        if value is None:
            raise ValueError("Поле нельзя очистить")

        if value is not None and isinstance(value,str):
            value=value.strip()

            if is_phone_number(value):
                raise ValueError("username не может быть номером телефона")

            if "@" in value:
                raise ValueError("@ недопустимый символ для username")

        return value

    @field_validator('name', mode='before')
    @classmethod
    def valid_name(cls, value):
        if value is None:
            raise ValueError("Поле нельзя очистить")

        if value is not None and isinstance(value, str):
            value = value.strip()

            if is_phone_number(value):
                raise ValueError("name не может быть номером телефона")

            if not value:
                raise ValueError("Поле не может содержать только пробелы")
        return value


