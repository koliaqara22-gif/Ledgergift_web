"""LedgerGift Mini App API server (FastAPI).

Serves the JSON API used by the Telegram Mini App front-end and (optionally)
the static front-end itself. Every request is authenticated with the signed
Telegram `initData`, so the user id cannot be forged by the client.

Run:  uvicorn main:app --host 127.0.0.1 --port 8080
"""
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import aiohttp

import db
from auth import AuthError, validate_init_data
from config import (
    BOT_TOKEN,
    BOT_USERNAME,
    BRAND_NAME,
    CURRENCIES,
    DEAL_TYPES,
    LANGUAGE_OPTIONS,
    MINIAPP_SHORT_NAME,
    SUPPORT_USERNAME,
)
from helpers import money, public_name, seller_level

app = FastAPI(title="LedgerGift Mini App API")

NOTIFY = {
    "ru": {"paid": "💳 <b>{brand}: сделка оплачена</b>", "paid_body": "Заказ <code>#{tag}</code> оплачен на <b>{amount} {currency}</b>.\nСтатус: <b>ждёт передачи товара</b>.\n\nПередайте товар через менеджера @{support}.", "done": "✅ <b>{brand}: сделка завершена</b>", "done_body": "Заказ <code>#{tag}</code> подтверждён.\nСумма: <b>{amount} {currency}</b>"},
    "en": {"paid": "💳 <b>{brand}: deal paid</b>", "paid_body": "Order <code>#{tag}</code> was paid: <b>{amount} {currency}</b>.\nStatus: <b>waiting for item transfer</b>.\n\nTransfer the item through @{support}.", "done": "✅ <b>{brand}: deal completed</b>", "done_body": "Order <code>#{tag}</code> was confirmed.\nAmount: <b>{amount} {currency}</b>"},
    "zh": {"paid": "💳 <b>{brand}：交易已付款</b>", "paid_body": "订单 <code>#{tag}</code> 已支付 <b>{amount} {currency}</b>。\n状态：<b>等待转交商品</b>。\n\n请通过 @{support} 转交商品。", "done": "✅ <b>{brand}：交易已完成</b>", "done_body": "订单 <code>#{tag}</code> 已确认。\n金额：<b>{amount} {currency}</b>"},
    "ar": {"paid": "💳 <b>{brand}: تم دفع الصفقة</b>", "paid_body": "تم دفع الطلب <code>#{tag}</code>: <b>{amount} {currency}</b>.\nالحالة: <b>بانتظار تسليم المنتج</b>.\n\nسلّم المنتج عبر @{support}.", "done": "✅ <b>{brand}: اكتملت الصفقة</b>", "done_body": "تم تأكيد الطلب <code>#{tag}</code>.\nالمبلغ: <b>{amount} {currency}</b>"},
    "ja": {"paid": "💳 <b>{brand}: 取引の支払い完了</b>", "paid_body": "注文 <code>#{tag}</code> は <b>{amount} {currency}</b> 支払われました。\n状態：<b>商品の譲渡待ち</b>。\n\n@{support} 経由で商品を渡してください。", "done": "✅ <b>{brand}: 取引完了</b>", "done_body": "注文 <code>#{tag}</code> が確認されました。\n金額：<b>{amount} {currency}</b>"},
    "kk": {"paid": "💳 <b>{brand}: мәміле төленді</b>", "paid_body": "<code>#{tag}</code> тапсырысы <b>{amount} {currency}</b> сомасына төленді.\nКүйі: <b>тауарды беруді күтуде</b>.\n\nТауарды @{support} арқылы беріңіз.", "done": "✅ <b>{brand}: мәміле аяқталды</b>", "done_body": "<code>#{tag}</code> тапсырысы расталды.\nСома: <b>{amount} {currency}</b>"},
}

# The Mini App is loaded inside Telegram from WEBAPP_URL. When the front-end is
# served by this same app there is no cross-origin request; CORS below only
# helps local development where the front-end may run on another port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------
async def current_user(x_telegram_init_data: str = Header(default="")) -> dict:
    try:
        user = validate_init_data(x_telegram_init_data)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    db.remember_user(int(user["id"]), user.get("username", ""), user.get("first_name", ""))
    return user


async def current_admin(user: dict = Depends(current_user)) -> dict:
    if not db.is_admin(int(user["id"])):
        raise HTTPException(status_code=403, detail="forbidden")
    return user


def deal_public(deal: db.Deal, lang: str) -> dict:
    d = deal.to_dict()
    d["item_type_label"] = DEAL_TYPES.get(deal.item_type, {}).get(lang if lang in ("ru", "en") else "en", deal.item_type)
    d["amount_label"] = money(deal.amount)
    return d


def profile_payload(user_id: int, username: str, lang: str) -> dict:
    stats = db.get_user_stats(user_id)
    orders = int(stats["success_orders"]) if stats else 0
    rating = float(stats["rating"]) if stats else 0.0
    volume = float(stats["success_volume"]) if stats else 0.0
    return {
        "id": user_id,
        "username": username,
        "orders": orders,
        "rating": round(rating, 1),
        "volume": volume,
        "volume_label": money(volume),
        "level": seller_level(orders, volume, lang),
    }


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
@app.get("/api/bootstrap")
async def bootstrap(user: dict = Depends(current_user)) -> dict:
    uid = int(user["id"])
    lang = db.get_user_lang(uid)
    payload = {
        "brand": BRAND_NAME,
        "bot_username": BOT_USERNAME,
        "miniapp_short_name": MINIAPP_SHORT_NAME,
        "support_username": SUPPORT_USERNAME,
        "payment_url": db.get_setting("payment_url", ""),
        "currencies": CURRENCIES,
        "deal_types": DEAL_TYPES,
        "languages": LANGUAGE_OPTIONS,
        "me": {
            "id": uid,
            "username": user.get("username", ""),
            "first_name": user.get("first_name", ""),
            "lang": lang,
            "is_admin": db.is_admin(uid),
            "is_owner": db.is_owner(uid),
        },
        "balances": db.get_balances(uid),
        "profile": profile_payload(uid, user.get("username", ""), lang),
    }
    # Deep-link: startapp=deal_TAG opens a specific deal.
    start_param = user.get("start_param", "")
    if start_param.startswith("deal_"):
        payload["start_deal"] = start_param.removeprefix("deal_")
    return payload


# ---------------------------------------------------------------------------
# Language / profile / balances
# ---------------------------------------------------------------------------
class LanguageIn(BaseModel):
    lang: str


@app.post("/api/language")
async def set_language(body: LanguageIn, user: dict = Depends(current_user)) -> dict:
    if body.lang not in LANGUAGE_OPTIONS:
        raise HTTPException(status_code=400, detail="unknown language")
    db.set_user_lang(int(user["id"]), body.lang)
    return {"ok": True, "lang": body.lang}


@app.get("/api/profile")
async def get_profile(user: dict = Depends(current_user)) -> dict:
    uid = int(user["id"])
    return profile_payload(uid, user.get("username", ""), db.get_user_lang(uid))


@app.get("/api/balances")
async def get_balances(user: dict = Depends(current_user)) -> dict:
    uid = int(user["id"])
    return {"balances": db.get_balances(uid), "history": db.balance_history(uid, 10)}


@app.get("/api/deals/history")
async def get_deals_history(user: dict = Depends(current_user)) -> dict:
    uid = int(user["id"])
    lang = db.get_user_lang(uid)
    deals = db.user_deals(uid, user.get("username", ""))
    return {"deals": [deal_public(deal, lang) for deal in deals]}


async def notify_completed_deal(deal: db.Deal, buyer_id: int) -> None:
    """Best-effort Telegram notices; a delivery error must not undo a deal."""
    if not BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    try:
        async with aiohttp.ClientSession() as session:
            for chat_id in {deal.seller_id, buyer_id}:
                strings = NOTIFY.get(db.get_user_lang(chat_id), NOTIFY["en"])
                text = strings["done"].format(brand=BRAND_NAME) + "\n\n" + strings["done_body"].format(tag=deal.tag, amount=money(deal.amount), currency=deal.currency)
                await session.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
    except aiohttp.ClientError:
        pass


async def notify_paid_deal(deal: db.Deal) -> None:
    """Tell the seller the escrow payment is received and action is needed."""
    if not BOT_TOKEN:
        return
    strings = NOTIFY.get(db.get_user_lang(deal.seller_id), NOTIFY["en"])
    text = strings["paid"].format(brand=BRAND_NAME) + "\n\n" + strings["paid_body"].format(tag=deal.tag, amount=money(deal.amount), currency=deal.currency, support=SUPPORT_USERNAME)
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
                json={"chat_id": deal.seller_id, "text": text, "parse_mode": "HTML"},
            )
    except aiohttp.ClientError:
        pass


@app.post("/api/balance/withdraw")
async def request_withdraw(user: dict = Depends(current_user)) -> dict:
    # Withdrawals are handled manually by the manager, same as the original bot.
    return {"ok": True, "support_username": SUPPORT_USERNAME}


# ---------------------------------------------------------------------------
# Deals
# ---------------------------------------------------------------------------
class DealIn(BaseModel):
    item_type: str
    item_link: str = ""
    stars_count: int | None = None
    currency: str
    amount: float
    buyer_username: str


@app.post("/api/deal/create")
async def create_deal(body: DealIn, user: dict = Depends(current_user)) -> dict:
    uid = int(user["id"])
    lang = db.get_user_lang(uid)
    if body.item_type not in DEAL_TYPES:
        raise HTTPException(status_code=400, detail="bad item type")
    if body.currency not in CURRENCIES:
        raise HTTPException(status_code=400, detail="bad currency")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")
    buyer = body.buyer_username.strip().lstrip("@")
    if len(buyer) < 2:
        raise HTTPException(status_code=400, detail="bad buyer username")
    link = body.item_link.strip()
    if body.item_type == "stars":
        link = link or "Telegram Stars"
    elif not link.startswith(("https://t.me/", "http://t.me/")):
        raise HTTPException(status_code=400, detail="item link must be a t.me url")

    deal = db.save_deal(
        {
            "item_type": body.item_type,
            "item_link": link,
            "stars_count": body.stars_count,
            "currency": body.currency,
            "amount": body.amount,
            "buyer_username": buyer,
        },
        uid,
        user.get("username") or str(uid),
    )
    # The bot's /start handler opens the Web App on this specific deal.
    # Unlike /<short-name>?startapp=..., this does not require BotFather /newapp.
    share = f"https://t.me/{BOT_USERNAME}?start=deal_{deal.tag}" if BOT_USERNAME else f"deal_{deal.tag}"
    return {"deal": deal_public(deal, lang), "share_link": share}


def _deal_view(deal: db.Deal, user: dict, lang: str) -> dict:
    uid = int(user["id"])
    username = (user.get("username") or "").lower()
    is_buyer = bool(username and username == deal.buyer_username.lower())
    is_seller = uid == deal.seller_id
    staff = db.is_staff(uid)
    return {
        "deal": deal_public(deal, lang),
        "role": {
            "is_buyer": is_buyer,
            "is_seller": is_seller,
            "is_staff": staff,
            "can_pay": (is_buyer or staff) and deal.status == "created",
            "can_confirm": (is_buyer or staff) and deal.status == "paid",
        },
        "support_username": SUPPORT_USERNAME,
    }


@app.get("/api/deal/{tag}")
async def get_deal(tag: str, user: dict = Depends(current_user)) -> dict:
    deal = db.find_deal(tag.lstrip("#").upper())
    if not deal:
        raise HTTPException(status_code=404, detail="deal not found")
    return _deal_view(deal, user, db.get_user_lang(int(user["id"])))


@app.post("/api/deal/{tag}/pay")
async def pay_deal(tag: str, user: dict = Depends(current_user)) -> dict:
    tag = tag.lstrip("#").upper()
    uid = int(user["id"])
    deal = db.find_deal(tag)
    if not deal:
        raise HTTPException(status_code=404, detail="deal not found")
    username = (user.get("username") or "").lower()
    if username != deal.buyer_username.lower() and not db.is_staff(uid):
        raise HTTPException(status_code=403, detail="deal assigned to another buyer")
    ok, reason = db.pay_deal_from_balance(tag, uid)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    updated_deal = db.find_deal(tag)
    await notify_paid_deal(updated_deal)
    return {"ok": True, "deal": deal_public(updated_deal, db.get_user_lang(uid))}


class ReceiptIn(BaseModel):
    received: bool


@app.post("/api/deal/{tag}/receipt")
async def confirm_receipt(tag: str, body: ReceiptIn, user: dict = Depends(current_user)) -> dict:
    tag = tag.lstrip("#").upper()
    uid = int(user["id"])
    deal = db.find_deal(tag)
    if not deal:
        raise HTTPException(status_code=404, detail="deal not found")
    username = (user.get("username") or "").lower()
    if username != deal.buyer_username.lower() and not db.is_staff(uid):
        raise HTTPException(status_code=403, detail="not your confirmation")
    if not body.received:
        return {"ok": False, "support_username": SUPPORT_USERNAME}
    ok, reason, deal = db.release_deal_to_seller(tag)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    await notify_completed_deal(deal, uid)
    return {"ok": True, "deal": deal_public(deal, db.get_user_lang(uid))}


# ---------------------------------------------------------------------------
# Top
# ---------------------------------------------------------------------------
@app.get("/api/top")
async def get_top(mode: str = "orders", user: dict = Depends(current_user)) -> dict:
    lang = db.get_user_lang(int(user["id"]))
    mode = "volume" if mode == "volume" else "orders"
    rows = db.top_users(mode)
    items = []
    for row in rows:
        orders = int(row["success_orders"])
        volume = float(row["success_volume"])
        items.append({
            "name": public_name(row),
            "orders": orders,
            "volume": volume,
            "volume_label": money(volume),
            "rating": round(float(row["rating"]), 1),
            "level": seller_level(orders, volume, lang),
        })
    return {"mode": mode, "items": items}


# ---------------------------------------------------------------------------
# Admin (all endpoints require db.is_admin)
# ---------------------------------------------------------------------------
@app.get("/api/admin/history")
async def admin_history(user: dict = Depends(current_admin)) -> dict:
    return {"history": db.balance_history(int(user["id"]), 15)}


@app.get("/api/admin/user/{target_id}")
async def admin_user(target_id: int, user: dict = Depends(current_admin)) -> dict:
    lang = db.get_user_lang(int(user["id"]))
    row = db.get_user_profile_row(target_id)
    uname = (row["username"] if row else "") or ""
    return {
        "id": target_id,
        "username": uname,
        "profile": profile_payload(target_id, uname, lang),
        "balances": db.get_balances(target_id),
        "history": db.balance_history(target_id, 8),
    }


@app.get("/api/admin/deal/{tag}")
async def admin_deal(tag: str, user: dict = Depends(current_admin)) -> dict:
    deal = db.find_deal(tag.lstrip("#").upper())
    if not deal:
        raise HTTPException(status_code=404, detail="deal not found")
    return {"deal": deal_public(deal, db.get_user_lang(int(user["id"])))}


class AddBalanceIn(BaseModel):
    user_id: int
    amount: float
    currency: str = "Stars"


@app.post("/api/admin/addbalance")
async def admin_add_balance(body: AddBalanceIn, user: dict = Depends(current_admin)) -> dict:
    if body.currency not in CURRENCIES:
        raise HTTPException(status_code=400, detail="bad currency")
    db.add_balance(body.user_id, body.amount, body.currency, reason="manual_topup", actor_id=int(user["id"]))
    return {"ok": True, "balances": db.get_balances(body.user_id)}


class SetStatsIn(BaseModel):
    user_id: int
    orders: int
    rating: float
    volume: float = 0


@app.post("/api/admin/setstats")
async def admin_set_stats(body: SetStatsIn, user: dict = Depends(current_admin)) -> dict:
    db.set_user_stats(body.user_id, body.orders, body.rating, body.volume)
    return {"ok": True}


class SetPayLinkIn(BaseModel):
    url: str


@app.post("/api/admin/setpaylink")
async def admin_set_paylink(body: SetPayLinkIn, user: dict = Depends(current_admin)) -> dict:
    if not body.url.startswith(("https://", "http://")):
        raise HTTPException(status_code=400, detail="url must start with http(s)")
    db.set_setting("payment_url", body.url)
    return {"ok": True, "payment_url": body.url}


class AddAdminIn(BaseModel):
    user_id: int


@app.post("/api/admin/addadmin")
async def admin_add_admin(body: AddAdminIn, user: dict = Depends(current_admin)) -> dict:
    # Only owners (ADMIN_IDS in .env) can add new admins.
    if not db.is_owner(int(user["id"])):
        raise HTTPException(status_code=403, detail="owner only")
    db.add_admin(body.user_id, int(user["id"]))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Static front-end (optional; can also be hosted separately)
# ---------------------------------------------------------------------------
@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
