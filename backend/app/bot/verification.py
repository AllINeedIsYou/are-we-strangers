import asyncio
from aiogram import Router,F
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import Message,KeyboardButton, ReplyKeyboardMarkup
from backend.app.services.phone_verification import get_active_phone_verification
from backend.database.session import SessionLocal

router = Router()

def is_verification_active(token:str):
    with SessionLocal() as session:
        query=get_active_phone_verification(session, token)
        if query is not None:
            return True
        else:
            return False


@router.message(CommandStart())
async def start_verification(message: Message, command: CommandObject):
    if message.chat.type != "private":
        return

    if not command.args:
        await message.answer('Для подтверждения номера открой ссылку после регистрации на сайте')
        return
    else:
        is_active = await asyncio.to_thread(
            is_verification_active,
            command.args,
        )
        if is_active==False:
            await message.answer('Ссылка недействительна или срок её действия истёк')
            return
        else:
            await message.answer('Ссылка действительна. Продолжим подтверждение номера')
            button = KeyboardButton(
                text="Поделиться номером",
                request_contact=True,
            )
            keyboard = ReplyKeyboardMarkup(
                keyboard=[[button]],
                resize_keyboard=True,
                one_time_keyboard=True,
            )
            await message.answer(
                "Поделись своим номером, указанным при регистрации.",
                reply_markup=keyboard,
            )

@router.message(F.contact, F.chat.type == "private")
async def receive_contact(message: Message):
    if (message.contact.user_id is None) or (message.from_user.id!=message.contact.user_id):
        await message.answer('Отправь свой контакт через кнопку “Поделиться номером”')
        return
    else:
        await message.answer('Контакт получен')