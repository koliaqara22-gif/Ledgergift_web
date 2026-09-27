"""Thin launcher bot for the LedgerGift Mini App.

Responsibilities (kept intentionally small \u2014 all business logic now lives in
the Mini App / API):
  * Show a button that opens the Mini App.
  * Set the chat menu button to the Web App.
  * Handle deep links (t.me/<bot>?start=deal_TAG) and forward the user into
    the Mini App on the right deal.
  * Hide the /admin command from ordinary users: the command list shown in the
    Telegram UI only contains /admin for the admin ids configured in .env.

Run:  python bot.py
"""
import asyncio
import logging
from pathlib import Path

from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    BotCommand,
    BotCommandScopeChat,
    BotCommandScopeDefault,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    CallbackQuery,
    FSInputFile,
    Message,
    MenuButtonWebApp,
    WebAppInfo,
)

import db
from config import (
    ADMIN_IDS,
    BOT_TOKEN,
    BRAND_NAME,
    MINIAPP_SHORT_NAME,
    SUPPORT_USERNAME,
    WEBAPP_URL,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("ledgergift")

router = Router()
ASSETS_DIR = Path(__file__).resolve().parent / "assets"

LANGUAGE_BUTTONS = [
    ("ru", "🇷🇺 Русский"), ("en", "🇺🇸 English"), ("zh", "🇨🇳 中文"),
    ("ar", "🇸🇦 العربية"), ("ja", "🇯🇵 日本語"), ("kk", "🇰🇿 Қазақша"),
]

WELCOME = {
    "ru": ("❕ <b>Добро пожаловать в {brand}!</b>", "{brand} — сервис для безопасных внебиржевых сделок.\nАвтоматизированный алгоритм исполнения и быстрый вывод средств.", "1️⃣ Автоматические сделки с NFT и подарками.\n\n2️⃣ Полная защита обеих сторон.\n\n3️⃣ Средства заморожены до подтверждения.\n\n4️⃣ Передача через менеджера: @{support}", "💬 Менеджер", "🎁 Открыть {brand}"),
    "en": ("❕ <b>Welcome to {brand}!</b>", "{brand} is a secure service for off-market deals.\nAutomated execution and fast withdrawals.", "1️⃣ Automated NFT and gift deals.\n\n2️⃣ Full protection for both parties.\n\n3️⃣ Funds are frozen until confirmation.\n\n4️⃣ Transfer through manager: @{support}", "💬 Manager", "🎁 Open {brand}"),
    "zh": ("❕ <b>欢迎来到 {brand}！</b>", "{brand} 是安全的场外交易服务。\n自动执行算法与快速提现。", "1️⃣ NFT 和礼物自动交易。\n\n2️⃣ 全面保护交易双方。\n\n3️⃣ 资金将在确认前冻结。\n\n4️⃣ 通过客服转交：@{support}", "💬 客服", "🎁 打开 {brand}"),
    "ar": ("❕ <b>مرحباً بك في {brand}!</b>", "{brand} خدمة آمنة للصفقات خارج السوق.\nتنفيذ آلي وسحب سريع للأموال.", "1️⃣ معاملات NFT والهدايا تلقائياً.\n\n2️⃣ حماية كاملة للطرفين.\n\n3️⃣ تُجمّد الأموال حتى التأكيد.\n\n4️⃣ التحويل عبر الدعم: @{support}", "💬 الدعم", "🎁 افتح {brand}"),
    "ja": ("❕ <b>{brand} へようこそ！</b>", "{brand} は安全な相対取引サービスです。\n自動実行と迅速な出金に対応します。", "1️⃣ NFT とギフトの自動取引。\n\n2️⃣ 双方を完全に保護します。\n\n3️⃣ 確認まで資金は保留されます。\n\n4️⃣ サポート経由で譲渡：@{support}", "💬 サポート", "🎁 {brand} を開く"),
    "kk": ("❕ <b>{brand} жүйесіне қош келдіңіз!</b>", "{brand} — қауіпсіз биржадан тыс мәмілелер сервисі.\nАвтоматты орындау және қаражатты жылдам шығару.", "1️⃣ NFT және сыйлықтармен автоматты мәмілелер.\n\n2️⃣ Екі тараптың толық қорғанысы.\n\n3️⃣ Қаражат расталғанша бұғатталады.\n\n4️⃣ Қолдау арқылы беру: @{support}", "💬 Қолдау", "🎁 {brand} ашу"),
}


def open_app_keyboard(start_param: str = "", lang: str = "ru") -> InlineKeyboardMarkup:
    # A Web App button opens the Mini App directly inside the chat.
    url = WEBAPP_URL
    if start_param:
        # startapp payload is passed through when opening via the direct link;
        # for the in-chat Web App button we append it as a query param that the
        # front-end also understands.
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}tgWebAppStartParam={start_param}"
    words = WELCOME.get(lang, WELCOME["en"])
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=words[4].format(brand=BRAND_NAME), web_app=WebAppInfo(url=url))],
            [InlineKeyboardButton(text=words[3], url=f"https://t.me/{SUPPORT_USERNAME}")],
        ]
    )


def language_keyboard(start_param: str) -> InlineKeyboardMarkup:
    rows = []
    for index in range(0, len(LANGUAGE_BUTTONS), 2):
        row = []
        for code, label in LANGUAGE_BUTTONS[index:index + 2]:
            row.append(InlineKeyboardButton(text=label, callback_data=f"lang:{code}:{start_param or '-'}"))
        rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def send_welcome(message: Message, lang: str, start_param: str = "") -> None:
    title, intro, body, manager_label, _ = WELCOME.get(lang, WELCOME["en"])
    caption = (
        title.format(brand=BRAND_NAME) + "\n\n"
        f"<blockquote>{intro.format(brand=BRAND_NAME)}\n\n{body.format(support=SUPPORT_USERNAME)}</blockquote>"
    )
    await message.answer_photo(
        FSInputFile(ASSETS_DIR / "welcome.png"), caption=caption,
        reply_markup=open_app_keyboard(start_param, lang), parse_mode=ParseMode.HTML,
    )


@router.message(Command("start"))
async def start(message: Message, command: CommandObject) -> None:
    user = message.from_user
    if user:
        db.remember_user(user.id, user.username or "", user.first_name or "")
    start_param = (command.args or "").strip()
    caption = (
        f"<b>{BRAND_NAME} ✦</b>\n\n"
        "Выберите язык интерфейса / Choose your language\n"
        "選擇語言 / اختر لغتك / 言語を選択 / Тілді таңдаңыз"
    )
    await message.answer_photo(
        FSInputFile(ASSETS_DIR / "language-welcome.png"), caption=caption,
        reply_markup=language_keyboard(start_param), parse_mode=ParseMode.HTML,
    )


@router.callback_query(F.data.startswith("lang:"))
async def choose_language(callback: CallbackQuery) -> None:
    _, lang, start_param = (callback.data or "lang:en:-").split(":", 2)
    user = callback.from_user
    db.remember_user(user.id, user.username or "", user.first_name or "")
    db.set_user_lang(user.id, lang)
    await callback.answer("✓")
    if callback.message:
        await send_welcome(callback.message, lang, "" if start_param == "-" else start_param)


@router.message(Command("admin"))
async def admin(message: Message) -> None:
    user = message.from_user
    if not user or not db.is_admin(user.id):
        # Regular users never see /admin in the menu and get no hint here.
        await message.answer("\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0430.")
        return
    await message.answer(
        "\U0001F6E1 <b>\u0410\u0434\u043c\u0438\u043d-\u043f\u0430\u043d\u0435\u043b\u044c</b> \u0442\u0435\u043f\u0435\u0440\u044c \u0432\u043d\u0443\u0442\u0440\u0438 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u044f.\n"
        "\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 " + BRAND_NAME + " \u2014 \u0440\u0430\u0437\u0434\u0435\u043b \u00ab\u0410\u0434\u043c\u0438\u043d\u00bb \u043f\u043e\u044f\u0432\u043b\u044f\u0435\u0442\u0441\u044f \u0442\u043e\u043b\u044c\u043a\u043e \u0443 \u0430\u0434\u043c\u0438\u043d\u043e\u0432.",
        reply_markup=open_app_keyboard("admin"),
        parse_mode=ParseMode.HTML,
    )


async def setup_commands(bot: Bot) -> None:
    """Public users see only /start; admins additionally see /admin."""
    public = [BotCommand(command="start", description=f"\u041e\u0442\u043a\u0440\u044b\u0442\u044c {BRAND_NAME}")]
    await bot.set_my_commands(public, scope=BotCommandScopeDefault())

    admin_commands = public + [BotCommand(command="admin", description="\u0410\u0434\u043c\u0438\u043d-\u043f\u0430\u043d\u0435\u043b\u044c")]
    for admin_id in db.admin_user_ids():
        try:
            await bot.set_my_commands(admin_commands, scope=BotCommandScopeChat(chat_id=admin_id))
        except Exception as exc:  # admin may not have started the bot yet
            logger.warning("could not set admin commands for %s: %s", admin_id, exc)


async def setup_menu_button(bot: Bot) -> None:
    if WEBAPP_URL:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text=BRAND_NAME, web_app=WebAppInfo(url=WEBAPP_URL))
        )


async def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN is empty. Fill it in .env")
    if not WEBAPP_URL:
        logger.warning("WEBAPP_URL is empty \u2014 the Web App button will not work until you set it.")
    db.init_db()
    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    await setup_commands(bot)
    await setup_menu_button(bot)
    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    logger.info("%s launcher bot started", BRAND_NAME)
    await dispatcher.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
