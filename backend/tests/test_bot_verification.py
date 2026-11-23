import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiogram import Bot, Dispatcher
from aiogram.client.session.base import BaseSession
from aiogram.exceptions import TelegramNetworkError
from aiogram.filters import CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.methods import SendMessage
from aiogram.types import Chat, Message, ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
from sqlalchemy import create_engine, event
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import attributes, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.bot import verification as bot
from backend.app.core.security import hash_token, verify_verification_code
from backend.app.models import EmailChanges, PhoneVerification, Users


class VerificationBotTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.storage = MemoryStorage()
        self.state = FSMContext(
            storage=self.storage,
            key=StorageKey(bot_id=1, chat_id=42, user_id=42),
        )
        self.message = SimpleNamespace(
            chat=SimpleNamespace(type="private"),
            from_user=SimpleNamespace(id=42),
            contact=SimpleNamespace(user_id=42, phone_number="+79991234567"),
            answer=AsyncMock(),
        )

    async def asyncTearDown(self):
        await self.storage.close()

    async def start(self, args):
        await bot.start_verification(
            self.message, CommandObject(command="start", args=args), self.state
        )

    async def prepare(self, mode="email_change"):
        await self.state.update_data(
            verification_token="test-token", verification_type=mode
        )

    async def test_start_selects_scenario_and_strips_only_initial_prefix(self):
        for args, mode, token in (
            ("email_email_test", "email_change", "email_test"),
            ("test-token", "phone", "test-token"),
        ):
            with self.subTest(mode=mode), patch.object(
                bot, "is_email_change_active", return_value=True
            ) as email, patch.object(bot, "is_verification_active", return_value=True) as phone:
                await self.start(args)
                selected, unused = (email, phone) if mode == "email_change" else (phone, email)
                selected.assert_called_once_with(token)
                unused.assert_not_called()
                self.assertEqual(await self.state.get_data(), {
                    "verification_token": token, "verification_type": mode
                })
                keyboard = self.message.answer.call_args.kwargs["reply_markup"]
                self.assertIsInstance(keyboard, ReplyKeyboardMarkup)
                self.assertTrue(keyboard.keyboard[0][0].request_contact)

    async def test_missing_or_invalid_link_clears_previous_operation(self):
        for args in (None, "email_", "email_expired", "expired"):
            with self.subTest(args=args), patch.object(
                bot, "is_email_change_active", return_value=False
            ), patch.object(bot, "is_verification_active", return_value=False):
                await self.prepare()
                await self.start(args)
                self.assertEqual(await self.state.get_data(), {})
                self.assertIsInstance(
                    self.message.answer.call_args.kwargs["reply_markup"], ReplyKeyboardRemove
                )

    async def test_group_start_does_not_change_state_or_reply(self):
        await self.prepare()
        self.message.chat.type = "group"
        await self.start("email_test")
        self.message.answer.assert_not_awaited()
        self.assertTrue(await self.state.get_data())

    async def test_foreign_or_unidentified_contact_never_requests_code(self):
        await self.prepare()
        for contact_id in (99, None):
            self.message.contact.user_id = contact_id
            with self.subTest(contact_id=contact_id), patch.object(
                bot, "issue_email_code_for_contact"
            ) as issue:
                await bot.receive_contact(self.message, self.state)
                issue.assert_not_called()
                self.assertTrue(await self.state.get_data())

    async def test_missing_or_unknown_mode_requires_new_link(self):
        for mode in (None, "unexpected"):
            with self.subTest(mode=mode), patch.object(bot, "issue_code_for_contact") as phone:
                await self.prepare(mode)
                await bot.receive_contact(self.message, self.state)
                phone.assert_not_called()
                self.assertEqual(await self.state.get_data(), {})

    async def test_code_dispatch_and_success_clear_state(self):
        for mode in ("email_change", "phone"):
            with self.subTest(mode=mode), patch.object(
                bot, "issue_email_code_for_contact", return_value="012345"
            ) as email, patch.object(bot, "issue_code_for_contact", return_value="012345") as phone:
                await self.prepare(mode)
                await bot.receive_contact(self.message, self.state)
                selected, unused = (email, phone) if mode == "email_change" else (phone, email)
                selected.assert_called_once_with("test-token", "+79991234567", 42)
                unused.assert_not_called()
                self.assertIn("012345", self.message.answer.call_args.args[0])
                self.assertIsInstance(
                    self.message.answer.call_args.kwargs["reply_markup"], ReplyKeyboardRemove
                )
                self.assertEqual(await self.state.get_data(), {})

    async def test_cooldown_and_contact_mismatch_preserve_state_for_retry(self):
        for error in (None, bot.VerificationCooldownError("Подожди 60 секунд")):
            with self.subTest(error=error), patch.object(
                bot, "issue_email_code_for_contact", return_value=None, side_effect=error
            ):
                await self.prepare()
                await bot.receive_contact(self.message, self.state)
                self.assertTrue(await self.state.get_data())
                self.assertNotIn("Код подтверждения:", self.message.answer.call_args.args[0])

    async def test_database_failure_shows_retry_without_error_details(self):
        with patch.object(bot, "is_email_change_active", side_effect=SQLAlchemyError("private")):
            with self.assertLogs(bot.logger, level="ERROR"):
                await self.start("email_test")
            self.assertEqual(await self.state.get_data(), {})
        await self.prepare()
        with patch.object(bot, "issue_email_code_for_contact", side_effect=SQLAlchemyError("private")):
            with self.assertLogs(bot.logger, level="ERROR"):
                await bot.receive_contact(self.message, self.state)
            self.assertTrue(await self.state.get_data())
        self.assertNotIn("private", self.message.answer.call_args.args[0])

    async def test_telegram_send_failure_keeps_state(self):
        await self.prepare()
        self.message.answer.side_effect = TelegramNetworkError(
            method=SendMessage(chat_id=42, text="test"), message="offline"
        )
        with patch.object(bot, "issue_email_code_for_contact", return_value="012345"):
            with self.assertRaises(TelegramNetworkError):
                await bot.receive_contact(self.message, self.state)
        self.assertTrue(await self.state.get_data())

    async def test_private_contact_guard(self):
        await self.prepare()
        self.message.chat.type = "group"
        await bot.receive_contact(self.message, self.state)
        self.message.answer.assert_not_awaited()

    async def test_dispatcher_routes_real_updates_without_network(self):
        class OfflineSession(BaseSession):
            def __init__(self):
                super().__init__()
                self.sent = []

            async def close(self):
                pass

            async def make_request(self, bot, method, timeout=None):
                if not isinstance(method, SendMessage):
                    raise AssertionError("Unexpected Telegram request")
                self.sent.append(method)
                return Message(message_id=len(self.sent), date=datetime.now(timezone.utc),
                               chat=Chat(id=42, type="private"), text=method.text)

            async def stream_content(self, *args, **kwargs):
                raise AssertionError("No network allowed")
                yield b""

        session = OfflineSession()
        telegram_bot = Bot(token="123456789:offline-test-token", session=session)
        dispatcher = Dispatcher()
        dispatcher.include_router(bot.router)
        base = {
            "date": int(datetime.now(timezone.utc).timestamp()),
            "chat": {"id": 42, "type": "private"},
            "from": {"id": 42, "is_bot": False, "first_name": "Test"},
        }
        try:
            with patch.object(bot, "is_email_change_active", return_value=True), patch.object(
                bot, "issue_email_code_for_contact", return_value="012345"
            ) as issue:
                await dispatcher.feed_update(telegram_bot, Update.model_validate({
                    "update_id": 1, "message": {
                        **base, "message_id": 1, "text": "/start email_test-token",
                        "entities": [{"type": "bot_command", "offset": 0, "length": 6}],
                    },
                }))
                await dispatcher.feed_update(telegram_bot, Update.model_validate({
                    "update_id": 2, "message": {
                        **base, "message_id": 2,
                        "contact": {"phone_number": "+79991234567", "first_name": "Test", "user_id": 42},
                    },
                }))
                issue.assert_called_once_with("test-token", "+79991234567", 42)
                self.assertEqual(len(session.sent), 2)
                self.assertIn("012345", session.sent[-1].text)
                self.assertIsInstance(session.sent[-1].reply_markup, ReplyKeyboardRemove)
        finally:
            await dispatcher.storage.close()
            await telegram_bot.session.close()

    async def test_real_services_with_in_memory_database(self):
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        factory = sessionmaker(bind=engine)

        def restore_timezone(obj, context, attrs=None):
            for field in ("created_at", "expires_at", "last_sent_at", "used_at", "revoked_at"):
                value = getattr(obj, field, None)
                if isinstance(value, datetime) and value.tzinfo is None:
                    attributes.set_committed_value(obj, field, value.replace(tzinfo=timezone.utc))

        for model in (EmailChanges, PhoneVerification):
            event.listen(model, "load", restore_timezone)
            event.listen(model, "refresh", restore_timezone)
        try:
            for model in (Users, EmailChanges, PhoneVerification):
                model.__table__.create(engine)
            now = datetime.now(timezone.utc)
            with factory() as session:
                user = Users(phone="+79991234567", email="old@example.com", name="Test",
                             username="@test", password_hash="unused", phone_verified_at=now)
                session.add(user)
                session.commit()
                session.add(EmailChanges(
                    user_id=user.id, old_email=user.email, new_email="new@example.com",
                    phone=user.phone, token_hash=hash_token("email-token"),
                    expires_at=now + timedelta(minutes=10),
                ))
                session.add(PhoneVerification(
                    user_id=user.id, token_hash=hash_token("phone-token"),
                    expires_at=now + timedelta(minutes=10),
                ))
                session.commit()
            with patch.object(bot, "SessionLocal", factory):
                for mode, token, model in (
                    ("email_change", "email-token", EmailChanges),
                    ("phone", "phone-token", PhoneVerification),
                ):
                    await self.start("email_" + token if mode == "email_change" else token)
                    await bot.receive_contact(self.message, self.state)
                    code = self.message.answer.call_args.args[0].split(": ", 1)[1].split("\n")[0]
                    with factory() as session:
                        application = session.query(model).one()
                        self.assertTrue(verify_verification_code(code, application.code_hash))
                        self.assertEqual(application.telegram_user_id, 42)
                        self.assertIsNotNone(application.last_sent_at)
                        self.assertIsNone(application.used_at)
                        self.assertEqual(session.query(Users).one().email, "old@example.com")
                    self.assertEqual(await self.state.get_data(), {})
        finally:
            for model in (EmailChanges, PhoneVerification):
                event.remove(model, "load", restore_timezone)
                event.remove(model, "refresh", restore_timezone)
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
