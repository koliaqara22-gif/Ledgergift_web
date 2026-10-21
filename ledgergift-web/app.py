"""Standalone LedgerGift website. It deliberately does not use Telegram Mini App data."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Cookie, FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "ledgergift_web.sqlite3"
sessions: dict[str, int] = {}
app = FastAPI(title="LedgerGift Web")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            balance REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS deals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            share_code TEXT UNIQUE NOT NULL,
            seller_id INTEGER NOT NULL,
            buyer_id INTEGER,
            buyer_email TEXT,
            buyer_contact TEXT,
            gift_name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            price REAL NOT NULL,
            currency TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'created',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)


init_db()


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return base64.b64encode(salt + key).decode("ascii")


def password_matches(password: str, encoded: str) -> bool:
    raw = base64.b64decode(encoded)
    return hmac.compare_digest(password_hash(password, raw[:16]), encoded)


def user_from_session(lg_session: str | None) -> sqlite3.Row:
    uid = sessions.get(lg_session or "")
    if not uid:
        raise HTTPException(401, "auth_required")
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not user:
        raise HTTPException(401, "auth_required")
    return user


def public_user(user: sqlite3.Row) -> dict:
    return {"id": user["id"], "name": user["name"], "balance": user["balance"]}


def public_deal(row: sqlite3.Row, viewer_id: int | None = None) -> dict:
    item = dict(row)
    item["is_seller"] = viewer_id == row["seller_id"]
    item["is_buyer"] = viewer_id == row["buyer_id"]
    item["is_participant"] = item["is_seller"] or item["is_buyer"]
    return item


class Credentials(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: str = Field(default="", max_length=120)
    password: str = Field(min_length=6, max_length=128)


class DealIn(BaseModel):
    gift_name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=600)
    price: float = Field(gt=0, le=10_000_000)
    currency: str = Field(pattern="^(TON|USDT|RUB|USD|Stars)$")
    buyer_contact: str = Field(default="", max_length=100)


class ActionIn(BaseModel):
    action: str = Field(pattern="^(pay|transferred|confirm|cancel)$")


@app.post("/api/auth/register")
def register(body: Credentials, response: Response):
    name = body.name.strip()
    email = f"{name.lower()}@ledgergift.local"
    try:
        with db() as conn:
            cur = conn.execute("INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)", (name, email, password_hash(body.password), now()))
            uid = cur.lastrowid
            user = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(409, "nickname_exists")
    token = secrets.token_urlsafe(32)
    sessions[token] = uid
    response.set_cookie("lg_session", token, httponly=True, samesite="lax", secure=os.getenv("COOKIE_SECURE", "0") == "1", max_age=60 * 60 * 24 * 30)
    return {"user": public_user(user)}


@app.post("/api/auth/login")
def login(body: Credentials, response: Response):
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE lower(name) = ?", (body.name.strip().lower(),)).fetchone()
    if not user or not password_matches(body.password, user["password_hash"]):
        raise HTTPException(401, "invalid_credentials")
    token = secrets.token_urlsafe(32)
    sessions[token] = user["id"]
    response.set_cookie("lg_session", token, httponly=True, samesite="lax", secure=os.getenv("COOKIE_SECURE", "0") == "1", max_age=60 * 60 * 24 * 30)
    return {"user": public_user(user)}


@app.post("/api/auth/logout")
def logout(response: Response, lg_session: str | None = Cookie(default=None)):
    if lg_session:
        sessions.pop(lg_session, None)
    response.delete_cookie("lg_session")
    return {"ok": True}


@app.get("/api/me")
def me(lg_session: str | None = Cookie(default=None)):
    return {"user": public_user(user_from_session(lg_session))}


WEB_CURRENCIES = ["Stars", "TON", "USDT", "RUB", "UAH", "USD", "BYN", "KZT", "UZS"]
web_requisites: dict[int, dict[str, dict]] = {}


@app.get("/api/bootstrap")
def bootstrap(lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    return {
        "brand": "LedgerGift", "bot_username": "", "miniapp_short_name": "", "support_username": "",
        "payment_url": "", "currencies": WEB_CURRENCIES, "deal_types": {
            "nft": {"ru": "NFT-подарок", "en": "NFT Gift"}, "stars": {"ru": "Звёзды", "en": "Telegram Stars"},
            "username": {"ru": "NFT-username", "en": "NFT Username"}, "crypto": {"ru": "Крипта", "en": "Crypto"}, "premium": {"ru": "Telegram Premium", "en": "Telegram Premium"},
        },
        "languages": {"ru": "🇷🇺 Русский", "en": "🇬🇧 English", "zh": "中文", "ar": "العربية", "ja": "日本語", "kk": "Қазақша"},
        "me": {"id": user["id"], "username": user["name"], "first_name": user["name"], "lang": "ru", "is_admin": False, "is_owner": False},
        "balances": {"Stars": 20000, "TON": 0, "USDT": 0, "RUB": 0, "UAH": 0, "USD": 0, "BYN": 0, "KZT": 0, "UZS": 0},
        "requisites_enabled": True,
        "profile": profile_for_web(user),
    }


def profile_for_web(user: sqlite3.Row) -> dict:
    return {"id": user["id"], "username": user["name"], "orders": 0, "rating": 0, "volume": 0, "volume_label": "0", "level": {"label": "Новичок"}, "deal_stats": {"total": 0, "completed": 0, "cancelled": 0}}


@app.get("/api/profile")
def mini_profile(lg_session: str | None = Cookie(default=None)):
    return profile_for_web(user_from_session(lg_session))


@app.get("/api/balances")
def mini_balances(lg_session: str | None = Cookie(default=None)):
    user_from_session(lg_session)
    return {"balances": {"Stars": 20000, "TON": 0, "USDT": 0, "RUB": 0, "UAH": 0, "USD": 0, "BYN": 0, "KZT": 0, "UZS": 0}, "history": []}


@app.get("/api/requisites")
def mini_requisites(lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    return {"enabled": True, "items": web_requisites.get(user["id"], {})}


@app.put("/api/requisites")
def mini_save_requisites(body: dict, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    currency = str(body.get("currency", ""))
    if currency not in WEB_CURRENCIES:
        raise HTTPException(400, "bad_currency")
    web_requisites.setdefault(user["id"], {})[currency] = {"kind": body.get("kind", ""), "label": body.get("label", ""), "value": body.get("value", "")}
    return {"ok": True}


@app.delete("/api/requisites/{currency}")
def mini_delete_requisites(currency: str, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    web_requisites.get(user["id"], {}).pop(currency, None)
    return {"ok": True}


@app.get("/api/deals/history")
def mini_deals_history(lg_session: str | None = Cookie(default=None)):
    user_from_session(lg_session)
    return {"deals": []}


@app.get("/api/top")
def mini_top(lg_session: str | None = Cookie(default=None)):
    user_from_session(lg_session)
    return {"items": []}


def mini_deal(row: sqlite3.Row) -> dict:
    labels = {"nft": "NFT-подарок", "stars": "Telegram Stars", "username": "NFT-username", "crypto": "Крипта", "premium": "Telegram Premium"}
    return {"tag": row["share_code"].upper(), "status": row["status"], "item_type": "nft", "item_type_label": labels["nft"], "item_link": row["description"] or "Telegram Gift", "stars_count": None, "amount": row["price"], "amount_label": str(row["price"]), "currency": row["currency"], "seller_id": row["seller_id"], "seller_username": "seller", "buyer_username": row["buyer_contact"].lstrip("@"), "created_at": row["created_at"], "transfer_seconds_left": None}


@app.post("/api/deal/create")
def mini_create_deal(body: dict, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    buyer = str(body.get("buyer_username", "")).strip().lstrip("@")
    amount = float(body.get("amount", 0))
    currency = str(body.get("currency", "Stars"))
    if len(buyer) < 2 or amount <= 0 or currency not in WEB_CURRENCIES:
        raise HTTPException(400, "bad_deal")
    code = secrets.token_urlsafe(8).replace("-", "").replace("_", "").upper()
    item = str(body.get("item_link", "Telegram Gift"))
    stamp = now()
    with db() as conn:
        cur = conn.execute("""INSERT INTO deals(share_code,seller_id,buyer_email,buyer_contact,gift_name,description,price,currency,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (code, user["id"], "", buyer, str(body.get("item_type", "NFT-подарок")), item, amount, currency, "created", stamp, stamp))
        row = conn.execute("SELECT * FROM deals WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {"deal": mini_deal(row), "share_link": f"{os.getenv('WEB_URL', '')}/#deal_{code}".lstrip("/") or f"deal_{code}"}


@app.get("/api/deal/{tag}")
def mini_get_deal(tag: str, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE upper(share_code) = ?", (tag.lstrip("#").upper(),)).fetchone()
    if not row:
        raise HTTPException(404, "deal_not_found")
    buyer = row["buyer_contact"].lstrip("@").lower() == user["name"].lower()
    seller = row["seller_id"] == user["id"]
    return {"deal": mini_deal(row), "role": {"is_buyer": buyer, "is_seller": seller, "is_staff": False, "can_pay": buyer and row["status"] == "created", "can_confirm": buyer and row["status"] == "transferred"}, "support_username": ""}


@app.post("/api/deal/{tag}/pay")
def mini_pay_deal(tag: str, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE upper(share_code) = ?", (tag.lstrip("#").upper(),)).fetchone()
        if not row or row["buyer_contact"].lstrip("@").lower() != user["name"].lower():
            raise HTTPException(403, "not_your_deal")
        if row["status"] != "created":
            raise HTTPException(409, "already_paid")
        conn.execute("UPDATE deals SET status = 'paid', updated_at = ? WHERE id = ?", (now(), row["id"]))
        row = conn.execute("SELECT * FROM deals WHERE id = ?", (row["id"],)).fetchone()
    return {"ok": True, "deal": mini_deal(row)}


@app.post("/api/deal/{tag}/transferred")
def mini_transferred_deal(tag: str, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE upper(share_code) = ?", (tag.lstrip("#").upper(),)).fetchone()
        if not row or row["seller_id"] != user["id"]:
            raise HTTPException(403, "not_your_deal")
        if row["status"] != "paid":
            raise HTTPException(409, "transfer_not_available")
        conn.execute("UPDATE deals SET status = 'transferred', updated_at = ? WHERE id = ?", (now(), row["id"]))
    return {"ok": True}


@app.post("/api/deal/{tag}/receipt")
def mini_receipt(tag: str, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE upper(share_code) = ?", (tag.lstrip("#").upper(),)).fetchone()
        if not row or row["buyer_contact"].lstrip("@").lower() != user["name"].lower():
            raise HTTPException(403, "not_your_deal")
        if row["status"] != "transferred":
            raise HTTPException(409, "transfer_not_confirmed")
        conn.execute("UPDATE deals SET status = 'completed', updated_at = ? WHERE id = ?", (now(), row["id"]))
    return {"ok": True}


@app.post("/api/language")
def mini_language(lg_session: str | None = Cookie(default=None)):
    user_from_session(lg_session)
    return {"ok": True}


@app.get("/api/deals")
def deals(lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        rows = conn.execute("SELECT * FROM deals WHERE seller_id = ? OR buyer_id = ? ORDER BY id DESC", (user["id"], user["id"])).fetchall()
    return {"items": [public_deal(row, user["id"]) for row in rows]}


@app.post("/api/deals")
def create_deal(body: DealIn, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    code = secrets.token_urlsafe(9).replace("-", "").replace("_", "")
    stamp = now()
    with db() as conn:
        cur = conn.execute("""INSERT INTO deals(share_code,seller_id,buyer_email,buyer_contact,gift_name,description,price,currency,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (code, user["id"], "", body.buyer_contact.strip(), body.gift_name.strip(), body.description.strip(), body.price, body.currency, "created", stamp, stamp))
        row = conn.execute("SELECT * FROM deals WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {"deal": public_deal(row, user["id"])}


@app.get("/api/deals/share/{code}")
def deal_by_share(code: str, lg_session: str | None = Cookie(default=None)):
    uid = sessions.get(lg_session or "")
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE share_code = ?", (code,)).fetchone()
    if not row:
        raise HTTPException(404, "deal_not_found")
    return {"deal": public_deal(row, uid)}


@app.post("/api/deals/share/{code}/join")
def join_deal(code: str, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE share_code = ?", (code,)).fetchone()
        if not row:
            raise HTTPException(404, "deal_not_found")
        if row["seller_id"] == user["id"]:
            raise HTTPException(400, "seller_cannot_join")
        if row["buyer_id"] and row["buyer_id"] != user["id"]:
            raise HTTPException(403, "deal_taken")
        conn.execute("UPDATE deals SET buyer_id = ?, updated_at = ? WHERE id = ?", (user["id"], now(), row["id"]))
        row = conn.execute("SELECT * FROM deals WHERE id = ?", (row["id"],)).fetchone()
    return {"deal": public_deal(row, user["id"])}


@app.post("/api/deals/{deal_id}/action")
def deal_action(deal_id: int, body: ActionIn, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
        if not row:
            raise HTTPException(404, "deal_not_found")
        seller, buyer = row["seller_id"] == user["id"], row["buyer_id"] == user["id"]
        transitions = {
            "pay": (buyer and row["status"] == "created", "paid"),
            "transferred": (seller and row["status"] == "paid", "transferred"),
            "confirm": (buyer and row["status"] == "transferred", "completed"),
            "cancel": ((seller or buyer) and row["status"] in ("created", "paid"), "cancelled"),
        }
        allowed, next_status = transitions[body.action]
        if not allowed:
            raise HTTPException(409, "action_unavailable")
        conn.execute("UPDATE deals SET status = ?, updated_at = ? WHERE id = ?", (next_status, now(), deal_id))
        row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
    return {"deal": public_deal(row, user["id"])}


app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="static")
