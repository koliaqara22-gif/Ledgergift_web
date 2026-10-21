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

from fastapi import Cookie, FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "ledgergift_web.sqlite3"
sessions: dict[str, int] = {}
admin_sessions: dict[str, int] = {}
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
        CREATE TABLE IF NOT EXISTS user_balances (
            user_id INTEGER NOT NULL,
            currency TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, currency)
        );
        CREATE TABLE IF NOT EXISTS balance_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            currency TEXT NOT NULL,
            amount REAL NOT NULL,
            reason TEXT NOT NULL,
            deal_tag TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS admins (
            user_id INTEGER PRIMARY KEY,
            granted_by INTEGER NOT NULL,
            granted_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            target TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
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


WEB_CURRENCIES = ["Stars", "TON", "USDT", "RUB", "UAH", "USD", "BYN", "KZT", "UZS"]


def normalized(value: str) -> str:
    return value.strip().lstrip("@").lower()


def configured_owner() -> str:
    return normalized(os.getenv("OWNER_NICKNAME", ""))


def is_owner(user: sqlite3.Row) -> bool:
    owner = configured_owner()
    return bool(owner) and normalized(user["name"]) == owner


def is_admin(user: sqlite3.Row) -> bool:
    if is_owner(user):
        return True
    with db() as conn:
        return conn.execute("SELECT 1 FROM admins WHERE user_id = ?", (user["id"],)).fetchone() is not None


def balances_for(user_id: int, conn: sqlite3.Connection | None = None) -> dict[str, float]:
    close = conn is None
    conn = conn or db()
    rows = conn.execute("SELECT currency, amount FROM user_balances WHERE user_id = ?", (user_id,)).fetchall()
    values = {currency: 0 for currency in WEB_CURRENCIES}
    values.update({row["currency"]: row["amount"] for row in rows})
    if close:
        conn.close()
    return values


def change_balance(conn: sqlite3.Connection, user_id: int, currency: str, amount: float, reason: str, deal_tag: str | None = None) -> None:
    current = conn.execute("SELECT amount FROM user_balances WHERE user_id = ? AND currency = ?", (user_id, currency)).fetchone()
    before = float(current["amount"]) if current else 0
    if before + amount < -0.000001:
        raise HTTPException(409, "insufficient_balance")
    conn.execute("""INSERT INTO user_balances(user_id,currency,amount) VALUES(?,?,?)
        ON CONFLICT(user_id,currency) DO UPDATE SET amount = excluded.amount""", (user_id, currency, before + amount))
    conn.execute("INSERT INTO balance_history(user_id,currency,amount,reason,deal_tag,created_at) VALUES(?,?,?,?,?,?)",
                 (user_id, currency, amount, reason, deal_tag, now()))


def write_audit(conn: sqlite3.Connection, actor_id: int, action: str, target: str = "") -> None:
    conn.execute("INSERT INTO audit_log(actor_id,action,target,created_at) VALUES(?,?,?,?)", (actor_id, action, target, now()))


def require_admin(lg_session: str | None, lg_admin: str | None) -> sqlite3.Row:
    user = user_from_session(lg_session)
    if not is_admin(user):
        raise HTTPException(403, "admin_required")
    if admin_sessions.get(lg_admin or "") != user["id"]:
        raise HTTPException(403, "admin_locked")
    return user


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
        "me": {"id": user["id"], "username": user["name"], "first_name": user["name"], "lang": "ru", "is_admin": is_admin(user), "is_owner": is_owner(user)},
        "balances": balances_for(user["id"]),
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
    user = user_from_session(lg_session)
    with db() as conn:
        history = conn.execute("SELECT currency,amount,reason,deal_tag,created_at FROM balance_history WHERE user_id = ? ORDER BY id DESC LIMIT 50", (user["id"],)).fetchall()
    return {"balances": balances_for(user["id"]), "history": [dict(row) for row in history]}


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
    user = user_from_session(lg_session)
    with db() as conn:
        rows = conn.execute("""SELECT * FROM deals WHERE seller_id = ? OR buyer_id = ?
            OR lower(replace(buyer_contact, '@', '')) = ? ORDER BY id DESC LIMIT 50""",
            (user["id"], user["id"], normalized(user["name"]))).fetchall()
    return {"deals": [mini_deal(row) for row in rows]}


@app.get("/api/top")
def mini_top(lg_session: str | None = Cookie(default=None)):
    user_from_session(lg_session)
    return {"items": []}


def mini_deal(row: sqlite3.Row) -> dict:
    labels = {"nft": "NFT-подарок", "stars": "Telegram Stars", "username": "NFT-username", "crypto": "Крипта", "premium": "Telegram Premium"}
    with db() as conn:
        seller = conn.execute("SELECT name FROM users WHERE id = ?", (row["seller_id"],)).fetchone()
    return {"tag": row["share_code"].upper(), "status": row["status"], "item_type": "nft", "item_type_label": labels["nft"], "item_link": row["description"] or "Telegram Gift", "stars_count": None, "amount": row["price"], "amount_label": str(row["price"]), "currency": row["currency"], "seller_id": row["seller_id"], "seller_username": seller["name"] if seller else "seller", "buyer_username": row["buyer_contact"].lstrip("@"), "created_at": row["created_at"], "transfer_seconds_left": None}


@app.post("/api/deal/create")
def mini_create_deal(body: dict, request: Request, lg_session: str | None = Cookie(default=None)):
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
    external = os.getenv("WEB_URL", "").rstrip("/")
    if not external:
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        external = f"{proto}://{request.headers.get('host', request.url.netloc)}"
    return {"deal": mini_deal(row), "share_link": f"{external}/?deal={code}"}


@app.get("/api/deal/{tag}")
def mini_get_deal(tag: str, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE upper(share_code) = ?", (tag.lstrip("#").upper(),)).fetchone()
    if not row:
        raise HTTPException(404, "deal_not_found")
    buyer = normalized(row["buyer_contact"] or "") == normalized(user["name"])
    seller = row["seller_id"] == user["id"]
    return {"deal": mini_deal(row), "role": {"is_buyer": buyer, "is_seller": seller, "is_staff": False, "can_pay": buyer and row["status"] == "created", "can_confirm": buyer and row["status"] == "transferred"}, "support_username": ""}


@app.post("/api/deal/{tag}/pay")
def mini_pay_deal(tag: str, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE upper(share_code) = ?", (tag.lstrip("#").upper(),)).fetchone()
        if not row or normalized(row["buyer_contact"] or "") != normalized(user["name"]):
            raise HTTPException(403, "not_your_deal")
        if row["status"] != "created":
            raise HTTPException(409, "already_paid")
        change_balance(conn, user["id"], row["currency"], -float(row["price"]), "deal_payment", row["share_code"])
        conn.execute("UPDATE deals SET buyer_id = ? WHERE id = ?", (user["id"], row["id"]))
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
        if not row or normalized(row["buyer_contact"] or "") != normalized(user["name"]):
            raise HTTPException(403, "not_your_deal")
        if row["status"] != "transferred":
            raise HTTPException(409, "transfer_not_confirmed")
        change_balance(conn, row["seller_id"], row["currency"], float(row["price"]), "deal_release", row["share_code"])
        conn.execute("UPDATE deals SET status = 'completed', updated_at = ? WHERE id = ?", (now(), row["id"]))
    return {"ok": True}


@app.post("/api/deal/{tag}/cancel")
def mini_cancel_deal(tag: str, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE upper(share_code) = ?", (tag.lstrip("#").upper(),)).fetchone()
        buyer = row and normalized(row["buyer_contact"] or "") == normalized(user["name"])
        seller = row and row["seller_id"] == user["id"]
        if not row or not (buyer or seller):
            raise HTTPException(403, "not_your_deal")
        if row["status"] not in ("created", "paid"):
            raise HTTPException(409, "cancel_unavailable")
        if row["status"] == "paid":
            if not row["buyer_id"]:
                raise HTTPException(409, "buyer_missing")
            change_balance(conn, row["buyer_id"], row["currency"], float(row["price"]), "deal_refund", row["share_code"])
        conn.execute("UPDATE deals SET status = 'cancelled', updated_at = ? WHERE id = ?", (now(), row["id"]))
    return {"ok": True}


@app.post("/api/deal/{tag}/notify-seller")
def mini_notify_seller(tag: str, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    with db() as conn:
        row = conn.execute("SELECT * FROM deals WHERE upper(share_code) = ?", (tag.lstrip("#").upper(),)).fetchone()
    if not row or normalized(row["buyer_contact"] or "") != normalized(user["name"]):
        raise HTTPException(403, "not_your_deal")
    return {"ok": True}


# ---- Administration -----------------------------------------------------
# The owner nickname and panel password live in Render environment variables,
# never in the repository.  The owner can then assign admin rights by nickname.
@app.post("/api/admin/unlock")
def admin_unlock(body: dict, response: Response, lg_session: str | None = Cookie(default=None)):
    user = user_from_session(lg_session)
    if not is_admin(user):
        raise HTTPException(403, "admin_required")
    configured_password = os.getenv("ADMIN_PANEL_PASSWORD", "")
    if not configured_password:
        raise HTTPException(503, "admin_not_configured")
    if not hmac.compare_digest(str(body.get("password", "")), configured_password):
        raise HTTPException(401, "invalid_admin_password")
    token = secrets.token_urlsafe(32)
    admin_sessions[token] = user["id"]
    response.set_cookie("lg_admin", token, httponly=True, samesite="lax", secure=os.getenv("COOKIE_SECURE", "0") == "1", max_age=60 * 60 * 8)
    return {"ok": True, "is_owner": is_owner(user)}


@app.get("/api/admin/overview")
def admin_overview(lg_session: str | None = Cookie(default=None), lg_admin: str | None = Cookie(default=None)):
    user = require_admin(lg_session, lg_admin)
    with db() as conn:
        admins = conn.execute("""SELECT u.id,u.name,a.granted_at FROM admins a JOIN users u ON u.id=a.user_id ORDER BY u.name""").fetchall()
        recent = conn.execute("SELECT action,target,created_at FROM audit_log ORDER BY id DESC LIMIT 20").fetchall()
        deal_count = conn.execute("SELECT count(*) AS count FROM deals WHERE status != 'completed'").fetchone()["count"]
    return {"owner": is_owner(user), "admins": [dict(row) for row in admins], "active_deals": deal_count, "logs": [dict(row) for row in recent]}


@app.post("/api/admin/admins")
def admin_grant(body: dict, lg_session: str | None = Cookie(default=None), lg_admin: str | None = Cookie(default=None)):
    owner = require_admin(lg_session, lg_admin)
    if not is_owner(owner):
        raise HTTPException(403, "owner_required")
    nickname = normalized(str(body.get("nickname", "")))
    if len(nickname) < 2:
        raise HTTPException(400, "bad_nickname")
    with db() as conn:
        target = conn.execute("SELECT * FROM users WHERE lower(name) = ?", (nickname,)).fetchone()
        if not target:
            raise HTTPException(404, "user_not_found")
        if is_owner(target):
            raise HTTPException(409, "owner_already_admin")
        conn.execute("INSERT INTO admins(user_id,granted_by,granted_at) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING", (target["id"], owner["id"], now()))
        write_audit(conn, owner["id"], "admin_granted", "@" + target["name"])
    return {"ok": True, "nickname": target["name"]}


@app.post("/api/admin/balance")
def admin_balance(body: dict, lg_session: str | None = Cookie(default=None), lg_admin: str | None = Cookie(default=None)):
    actor = require_admin(lg_session, lg_admin)
    nickname = normalized(str(body.get("nickname", "")))
    currency = str(body.get("currency", ""))
    try:
        amount = float(body.get("amount", 0))
    except (TypeError, ValueError):
        amount = 0
    if currency not in WEB_CURRENCIES or amount == 0:
        raise HTTPException(400, "bad_balance_change")
    with db() as conn:
        target = conn.execute("SELECT * FROM users WHERE lower(name) = ?", (nickname,)).fetchone()
        if not target:
            raise HTTPException(404, "user_not_found")
        change_balance(conn, target["id"], currency, amount, "manual_topup")
        write_audit(conn, actor["id"], "balance_changed", f"@{target['name']} {amount:g} {currency}")
        balances = balances_for(target["id"], conn)
    return {"ok": True, "balances": balances}


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
    # Kept only for compatibility with earlier clients.  The miniapp routes
    # above are authoritative because they also reserve and release funds.
    raise HTTPException(410, "use_deal_flow_endpoints")


app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="static")
