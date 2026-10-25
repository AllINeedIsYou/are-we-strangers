from fastapi import APIRouter
from backend.app.api.routes.auth import auth_router

api_router=APIRouter(prefix='/api')

api_router.include_router(auth_router)
#api_router.include_router()
#api_router.include_router()
#api_router.include_router()
#api_router.include_router()

