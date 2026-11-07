from typing import Annotated

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
    is_read:bool
    is_edited:bool


class ReadMessagesRequest(BaseModel):
    message_ids:list[Annotated[int,Field(gt=0)]]=Field(min_length=1,max_length=100)


class ReadMessagesResponse(BaseModel):
    reader_id:int
    chat_id:int
    message_ids:list[Annotated[int,Field(gt=0)]]=Field(max_length=100)


class EditMessageRequest(BaseModel):
    text:str=Field(min_length=1,max_length=4096)
    @field_validator('text')
    @classmethod
    def text_strip_valid(cls,value):
        if not value.strip():
            raise ValueError('Сообщение не может быть пустым')
        else:
            return value