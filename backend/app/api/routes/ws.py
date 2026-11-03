from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from starlette.concurrency import run_in_threadpool
from backend.app.api.dependencies import get_ws_user_id

ws_router = APIRouter(prefix="/ws", tags=["WebSocket"])

@ws_router.websocket('')
async def events(websocket:WebSocket):

    try:
        session_token = websocket.cookies.get('session_token')
        user_id=await run_in_threadpool(get_ws_user_id,session_token)
    except HTTPException as error:
        if error.status_code!=401:
            raise
        await websocket.close(code=1008)
        return


    await websocket.accept()
    await websocket.send_json({"type": "connected", "user_id":user_id})

    try:
        while True:
            message = await websocket.receive_json()

            if message == {"type": "ping"}:
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass