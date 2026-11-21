from pydantic import BaseModel, Field,field_validator,ConfigDict,EmailStr



class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email:EmailStr

class PasswordResetRequestResponse(BaseModel):
    message:str

class PasswordResetConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token:str=Field(min_length=1)
    new_password:str=Field(min_length=1)
    @field_validator('new_password')
    @classmethod
    def valid_password(cls,value):
        if ' ' in value:
            raise ValueError('Пвроль не должен содержать пробелы')
        return value