from backend.app.models.messages import Messages
from sqlalchemy import and_, or_


def message_visible_to(user_id:int):
    return or_(
        and_(Messages.sender_id==user_id,Messages.deleted_for_sender.is_(False)),

        and_(Messages.sender_id != user_id, Messages.deleted_for_recipient.is_(False)),

    )