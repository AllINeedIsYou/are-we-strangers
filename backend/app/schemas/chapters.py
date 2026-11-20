from typing import Literal

from pydantic import BaseModel, Field, field_validator, AwareDatetime, ConfigDict
from datetime import datetime

class ChapterCreateRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title:str=Field(min_length=1,max_length=70)
    @field_validator('title',mode='before')
    @classmethod
    def strip_to_title(cls,value):
        if isinstance(value,str):
            return value.strip()
        else:
            return value

class ChapterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:int
    chat_id:int
    author_id:int
    title:str
    status:Literal['pending','accepted','rejected']
    created_at:datetime
    started_at:datetime|None

class ChapterDecisionRequest(BaseModel):
    status: Literal['accepted', 'rejected']
