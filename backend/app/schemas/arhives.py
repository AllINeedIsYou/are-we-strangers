from pydantic import BaseModel
from typing import Literal

class ArchiveRequest(BaseModel):
    archived:bool

class ArchiveResponse(BaseModel):
    chat_ids:list[int]
    moment_ids:list[int]
    question_ids:list[int]

class ArchiveChangeResponse(BaseModel):
    chat_id:int
    item_type:Literal['chat','moment','question']
    item_id:int
    archived:bool