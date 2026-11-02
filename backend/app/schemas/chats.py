from pydantic import BaseModel, Field
from datetime import datetime
from backend.app.schemas.user import PublicUserResponse


class CreateChatRequest(BaseModel):
    partner_id: int = Field(gt=0)

class ChatResponse(BaseModel):
    id:int
    created_at:datetime
    partner:PublicUserResponse