"""Telegram WebApp initData validation.

The Mini App front-end sends the raw `Telegram.WebApp.initData` string with
every request (header `X-Telegram-Init-Data`). We verify it server-side using
the HMAC-SHA256 scheme documented by Telegram, so we can trust the user id
without the client being able to forge it.

Docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from config import BOT_TOKEN

# initData older than this many seconds is rejected (replay protection).
MAX_AUTH_AGE_SECONDS = 24 * 60 * 60


class AuthError(Exception):
    pass


def _secret_key() -> bytes:
    # secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
    return hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()


def validate_init_data(init_data: str) -> dict:
    """Validate initData and return the parsed Telegram user dict.

    Raises AuthError on any problem.
    """
    if not init_data:
        raise AuthError("missing init data")
    if not BOT_TOKEN:
        raise AuthError("server bot token not configured")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise AuthError("missing hash")

    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    calculated = hmac.new(_secret_key(), data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated, received_hash):
        raise AuthError("bad signature")

    auth_date = int(pairs.get("auth_date", "0") or "0")
    if auth_date and (time.time() - auth_date) > MAX_AUTH_AGE_SECONDS:
        raise AuthError("init data expired")

    user_raw = pairs.get("user")
    if not user_raw:
        raise AuthError("no user in init data")
    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError as exc:  # pragma: no cover
        raise AuthError("malformed user") from exc
    if "id" not in user:
        raise AuthError("user without id")

    # start_param carries deep-link payload (e.g. deal_MUMABC123).
    if pairs.get("start_param"):
        user["start_param"] = pairs["start_param"]
    return user
