from typing import Annotated,Literal

from pydantic import BaseModel, Field,field_validator,ConfigDict
from datetime import datetime


class MomentCreateRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reason:str=Field(min_length=1,max_length=1000)
    message_ids:list[Annotated[int,Field(gt=0)]]=Field(min_length=1,max_length=100)

    @field_validator('reason', mode='before')
    @classmethod
    def strip_to_reason(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value



class MomentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:int
    author_id:int
    chat_id:int
    reason:str
    response:str|None
    created_at:datetime

class MessageMomentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    moments_id:int
    author_name:str
    source_message_id:int
    message_created_at:datetime
    text:str

class MomentAndMessagesResponse(BaseModel):
    moment:MomentResponse

    messages:list[MessageMomentResponse]


class ReplyToMomentRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    response:str=Field(min_length=1,max_length=500)
    @field_validator('response',mode="before")
    @classmethod
    def strip_to_response(cls,value):
        if isinstance(value,str):
            return value.strip()
        else:
            return value


