import asyncio
import logging

from aiogram import F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import (KeyboardButton,Message,ReplyKeyboardMarkup,ReplyKeyboardRemove)
from sqlalchemy.exc import SQLAlchemyError

from backend.app.services.email_change import (get_active_email_change,issue_email_change_code)
from backend.app.services.phone_verification import (VerificationCooldownError,get_active_phone_verification,issue_phone_verification_code)
from backend.database.session import SessionLocal

router = Router()
logger = logging.getLogger(__name__)


def is_verification_active(token: str):
    with SessionLocal() as session:
        return get_active_phone_verification(session, token) is not None


def issue_code_for_contact(token: str, phone: str, telegram_user_id: int):
    with SessionLocal() as session:
        return issue_phone_verification_code(session, token, phone, telegram_user_id)


def is_email_change_active(token: str):
    with SessionLocal() as session:
        return get_active_email_change(session, token) is not None


def issue_email_code_for_contact(token: str, phone: str, telegram_user_id: int):
    with SessionLocal() as session:
        return issue_email_change_code(session, token, phone, telegram_user_id)


@router.message(CommandStart())
async def start_verification(message: Message, command: CommandObject, state: FSMContext):
    if message.chat.type != "private":
        return
    await state.clear()

    token = (command.args or "").strip()
    if not token:
        await message.answer(
            "Открой ссылку с сайта для подтверждения номера или смены почты.",
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    if token.startswith("email_"):
        token = token.removeprefix("email_")
        verification_type = "email_change"
        check_function = is_email_change_active
        contact_text = ("Для смены почты поделись своим подтверждённым номером телефона.")
    else:
        verification_type = "phone"
        check_function = is_verification_active
        contact_text = "Поделись своим номером, указанным при регистрации."

    try:
        is_active = bool(token) and await asyncio.to_thread(check_function, token)
    except SQLAlchemyError as error:
        logger.error("Telegram verification lookup failed: %s", type(error).__name__)
        await message.answer(
            "Не удалось проверить ссылку. Попробуй открыть её ещё раз позже.",
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    if not is_active:
        await message.answer(
            "Ссылка недействительна или срок её действия истёк.",
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    await state.update_data(
        verification_token=token,
        verification_type=verification_type,
    )
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="Поделиться номером", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )
    await message.answer(contact_text, reply_markup=keyboard)


@router.message(F.contact, F.chat.type == "private")
async def receive_contact(message: Message, state: FSMContext):
    if message.chat.type != "private" or message.from_user is None or message.contact is None:
        return

    if message.contact.user_id != message.from_user.id:
        await message.answer('Отправь свой контакт через кнопку «Поделиться номером».')
        return

    data = await state.get_data()
    token = data.get("verification_token")
    verification_type = data.get("verification_type")
    if not token or verification_type not in ("phone", "email_change"):
        await state.clear()
        await message.answer(
            "Сначала открой ссылку с сайта.",
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    if verification_type == "email_change":
        issue_function = issue_email_code_for_contact
    else:
        issue_function = issue_code_for_contact

    try:
        code = await asyncio.to_thread(
            issue_function,
            token,
            message.contact.phone_number,
            message.from_user.id,
        )
    except VerificationCooldownError as error:
        await message.answer(str(error))
        return
    except SQLAlchemyError as error:
        logger.error("Telegram verification code issuance failed: %s", type(error).__name__)
        await message.answer("Не удалось получить код. Попробуй ещё раз позже.")
        return

    if code is None:
        await message.answer("Ссылка недействительна или номер телефона не совпадает.")
        return

    await message.answer(
        f"Код подтверждения: {code}\nВведи его на сайте.",
        reply_markup=ReplyKeyboardRemove(),
    )
    await state.clear()
