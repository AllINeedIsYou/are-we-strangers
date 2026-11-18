from pydantic import BaseModel, Field, field_validator, AwareDatetime, ConfigDict
from datetime import datetime


class FutureQuestionRequest(BaseModel):

    text:str=Field(min_length=1,max_length=500)
    opens_at:AwareDatetime
    @field_validator('text', mode='before')
    @classmethod
    def strip_to_text(cls, value):
        if isinstance(value, str):
            return value.strip()
        else:
            return value



class FutureQuestionAnswerRequest(BaseModel):

    text:str=Field(min_length=1,max_length=500)
    @field_validator('text',mode='before')
    @classmethod
    def strip_to_text(cls,value):
        if isinstance(value,str):
            return value.strip()
        else:
            return value

class FutureQuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:int
    chat_id:int
    author_id:int
    text:str
    opens_at:datetime
    created_at:datetime
    my_answer:str|None=None
    partner_answer:str|None=None