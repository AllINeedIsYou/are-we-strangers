from fastapi import APIRouter
from backend.app.api.routes.auth import auth_router
from backend.app.api.routes.messages import message_router
from backend.app.api.routes.users import user_router
from backend.app.api.routes.chats import chats_router
from backend.app.api.routes.ws import ws_router
from backend.app.api.routes.moments import moments_router
from backend.app.api.routes.future_questions import future_questions_router

api_router=APIRouter(prefix='/api')

api_router.include_router(auth_router)
api_router.include_router(user_router)
api_router.include_router(chats_router)
api_router.include_router(message_router)
api_router.include_router(ws_router)
api_router.include_router(moments_router)
api_router.include_router(future_questions_router)
#api_router.include_router()
#api_router.include_router()
#api_router.include_router()

