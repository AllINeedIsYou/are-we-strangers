import asyncio
from aiogram import Router,F
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import Message,KeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove
from backend.app.services.phone_verification import get_active_phone_verification, issue_phone_verification_code,VerificationCooldownError
from backend.database.session import SessionLocal
from aiogram.fsm.context import FSMContext

router = Router()

def is_verification_active(token:str):
    with SessionLocal() as session:
        query=get_active_phone_verification(session, token)
        if query is not None:
            return True
        else:
            return False

def issue_code_for_contact(token:str,phone:str,telegram_user_id:int):
    with SessionLocal() as session:
        code=issue_phone_verification_code(session, token, phone, telegram_user_id)
        return code

@router.message(CommandStart())
async def start_verification(message: Message, command: CommandObject, state: FSMContext):
    if message.chat.type != "private":
        return
    await state.clear()

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
            await state.update_data(verification_token=command.args)
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
async def receive_contact(message: Message, state: FSMContext):
    if (message.contact.user_id is None) or (message.from_user.id!=message.contact.user_id):
        await message.answer('Отправь свой контакт через кнопку “Поделиться номером”')
        return
    else:
        data = await state.get_data()
        token = data.get("verification_token")

        if not token:
            await message.answer("Сначала открой ссылку после регистрации")
            return
        try:
            code = await asyncio.to_thread(
                issue_code_for_contact,
                token,
                message.contact.phone_number,
                message.from_user.id,
            )
        except VerificationCooldownError as error:
            await message.answer(str(error))
            return 
        if code is None:
            await message.answer('Ссылка недействительна или номер не совпадает с указанным при регистрации')
            return
        else:
            await message.answer(f"Код подтверждения: {code}\nВведи его на сайте.", reply_markup=ReplyKeyboardRemove())
