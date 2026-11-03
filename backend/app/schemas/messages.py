from pydantic import BaseModel, Field,field_validator,ConfigDict
from datetime import datetime


class CreateMessageRequest(BaseModel):
    text:str=Field(min_length=1, max_length=4096)
    @field_validator('text')
    @classmethod
    def text_strip_valid(cls,value):
        if not value.strip():
            raise ValueError('Сообщение не может быть пустым')
        else:
            return value

class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:int
    chat_id:int
    sender_id:int
    text:str
    created_at:datetime