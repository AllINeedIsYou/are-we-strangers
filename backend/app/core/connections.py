from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect,WebSocketDisconnected

class ConnectionManager:
    def __init__(self):
        self.connections: dict[int,set[WebSocket]]={}

    def add_connection(self, user_id:int,websocket: WebSocket):
        if user_id not in self.connections:
            self.connections[user_id]=set()
        self.connections[user_id].add(websocket)

    def remove_connection(self,user_id:int, websocket:WebSocket):
        if user_id not in self.connections:
            return

        self.connections[user_id].discard(websocket)### .discard(websocket) удаляет подключение из множества если оно есть, если нет, то ничего не делает

        if not self.connections[user_id]:
            del self.connections[user_id]

    async def send_to_user(self, user_id: int, event: dict):
        if user_id not in self.connections:
            return

        if not self.connections[user_id]: ### опционально
            return

        copy_self = self.connections[user_id].copy()

        for connection in copy_self:
            try:

                await connection.send_json(event)

            except(WebSocketDisconnected,WebSocketDisconnect):
                self.remove_connection(user_id=user_id,websocket=connection)

connection_manager = ConnectionManager()



