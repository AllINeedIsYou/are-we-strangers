from pydantic import BaseModel, Field, field_validator, AwareDatetime, ConfigDict
from datetime import datetime
from typing import Annotated
class ChatNotificationsRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    muted:bool

class ChatNotificationsResponse(BaseModel):

    chat_id:int=Field(gt=0)
    muted: bool

class MutedChatsResponse(BaseModel):

    chat_ids:list[Annotated[int,Field(gt=0)]]



