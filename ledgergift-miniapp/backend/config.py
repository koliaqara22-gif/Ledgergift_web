"""Configuration for the LedgerGift Mini App.

All values are read from environment variables (.env). Nothing secret is
hard-coded here.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BRAND_NAME = "LedgerGift"

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
BOT_USERNAME = os.getenv("BOT_USERNAME", "").lstrip("@")
# Short name of the Mini App you created via @BotFather (/newapp).
MINIAPP_SHORT_NAME = os.getenv("MINIAPP_SHORT_NAME", "app")
# Public https URL where the frontend is served (used for the menu button).
WEBAPP_URL = os.getenv("WEBAPP_URL", "").rstrip("/")

SUPPORT_USERNAME = os.getenv("SUPPORT_USERNAME", "LedgerGiftManager").lstrip("@")
PAYMENT_URL = os.getenv("PAYMENT_URL", f"https://t.me/{SUPPORT_USERNAME}")
# Fernet key for encrypted payout requisites. Set a stable value in Railway.
RECORDS_SECRET = os.getenv("RECORDS_SECRET", "")

BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "ledgergift.sqlite3")))


def _parse_ids(raw: str) -> set[int]:
    return {int(item.strip()) for item in raw.split(",") if item.strip().isdigit()}


# Owners: can do everything, including adding other admins.
ADMIN_IDS = _parse_ids(os.getenv("ADMIN_IDS", ""))
# Workers: staff without full admin rights.
WORKER_IDS = _parse_ids(os.getenv("WORKER_IDS", ""))

CURRENCIES = ["Stars", "TON", "USDT", "RUB", "UAH", "USD", "BYN", "KZT", "UZS"]

DEAL_TYPES = {
    "nft": {"ru": "NFT-\u043f\u043e\u0434\u0430\u0440\u043e\u043a", "en": "NFT Gift"},
    "stars": {"ru": "\u0417\u0432\u0451\u0437\u0434\u044b", "en": "Telegram Stars"},
    "username": {"ru": "NFT-username", "en": "NFT Username"},
    "crypto": {"ru": "\u041a\u0440\u0438\u043f\u0442\u0430", "en": "Crypto"},
    "premium": {"ru": "Telegram Premium", "en": "Telegram Premium"},
}

LANGUAGE_OPTIONS = {
    "ru": "\U0001F1F7\U0001F1FA \u0420\u0443\u0441\u0441\u043a\u0438\u0439",
    "en": "\U0001F1EC\U0001F1E7 English",
    "zh": "CN \u4e2d\u6587",
    "ar": "SA \u0627\u0644\u0639\u0631\u0628\u064a\u0629",
    "ja": "JP \u65e5\u672c\u8a9e",
    "kk": "KZ \u049a\u0430\u0437\u0430\u049b\u0448\u0430",
}


def is_owner(user_id: int) -> bool:
    return user_id in ADMIN_IDS
