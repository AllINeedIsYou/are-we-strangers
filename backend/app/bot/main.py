import asyncio

from aiogram import Bot, Dispatcher

from backend.app.bot.verification import router
from backend.app.core.telegram_config import telegram_settings

async def main():
    bot=Bot(token=telegram_settings.TELEGRAM_BOT_TOKEN.get_secret_value())
    dp=Dispatcher()
    dp.include_router(router)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())