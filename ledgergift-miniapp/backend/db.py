"""SQLite data layer for LedgerGift.

Holds the exact same business logic as the original bot: users, balances,
deals, admins, settings and balance history. It is shared by both the API
server and the thin launcher bot.
"""
import random
import sqlite3
import string
from contextlib import closing
from dataclasses import dataclass, asdict

from config import (
    ADMIN_IDS,
    CURRENCIES,
    DATABASE_PATH,
    PAYMENT_URL,
    RECORDS_SECRET,
    WORKER_IDS,
)
from cryptography.fernet import Fernet, InvalidToken


@dataclass
class Deal:
    tag: str
    seller_id: int
    seller_username: str
    buyer_username: str
    item_type: str
    item_link: str
    amount: float
    currency: str
    stars_count: int | None
    status: str

    def to_dict(self) -> dict:
        return asdict(self)


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _requisites_cipher() -> Fernet:
    """Requisites must never be written to the database as plain text."""
    if not RECORDS_SECRET:
        raise RuntimeError("requisites encryption is not configured")
    try:
        return Fernet(RECORDS_SECRET.encode())
    except (ValueError, TypeError) as exc:
        raise RuntimeError("requisites encryption key is invalid") from exc


def init_db() -> None:
    with closing(db()) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                lang TEXT NOT NULL DEFAULT 'ru',
                rating REAL NOT NULL DEFAULT 0,
                success_orders INTEGER NOT NULL DEFAULT 0,
                success_volume REAL NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS balances (
                user_id INTEGER NOT NULL,
                currency TEXT NOT NULL,
                amount REAL NOT NULL DEFAULT 0,
                PRIMARY KEY (user_id, currency)
            );
            CREATE TABLE IF NOT EXISTS deals (
                tag TEXT PRIMARY KEY,
                seller_id INTEGER NOT NULL,
                seller_username TEXT NOT NULL,
                buyer_username TEXT NOT NULL,
                item_type TEXT NOT NULL,
                item_link TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                stars_count INTEGER,
                status TEXT NOT NULL DEFAULT 'created',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS admins (
                user_id INTEGER PRIMARY KEY,
                added_by INTEGER,
                display_name TEXT NOT NULL DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS balance_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                currency TEXT NOT NULL,
                amount REAL NOT NULL,
                operation TEXT NOT NULL,
                reason TEXT NOT NULL,
                deal_tag TEXT,
                actor_id INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS deal_workspace (
                deal_tag TEXT PRIMARY KEY,
                assigned_admin_id INTEGER,
                note TEXT NOT NULL DEFAULT '',
                updated_by INTEGER,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS payout_requisites (
                user_id INTEGER NOT NULL,
                currency TEXT NOT NULL,
                kind TEXT NOT NULL,
                label TEXT NOT NULL DEFAULT '',
                encrypted_value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, currency)
            );
            """
        )
        connection.execute(
            "INSERT OR IGNORE INTO settings(key, value) VALUES('payment_url', ?)",
            (PAYMENT_URL,),
        )
        # Existing Railway databases were created before employee aliases.
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(admins)")}
        if "display_name" not in columns:
            connection.execute("ALTER TABLE admins ADD COLUMN display_name TEXT NOT NULL DEFAULT ''")
        connection.commit()


# ---------------------------------------------------------------------------
# Language
# ---------------------------------------------------------------------------
from config import LANGUAGE_OPTIONS  # noqa: E402


def get_user_lang(user_id: int | None) -> str:
    if not user_id:
        return "ru"
    with closing(db()) as connection:
        row = connection.execute("SELECT lang FROM users WHERE id = ?", (user_id,)).fetchone()
    return row["lang"] if row and row["lang"] in LANGUAGE_OPTIONS else "ru"


def set_user_lang(user_id: int, lang: str) -> None:
    with closing(db()) as connection:
        connection.execute(
            "INSERT INTO users(id, lang) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET lang = excluded.lang",
            (user_id, lang if lang in LANGUAGE_OPTIONS else "ru"),
        )
        connection.commit()


# ---------------------------------------------------------------------------
# Stats / profile
# ---------------------------------------------------------------------------
def get_user_stats(user_id: int) -> sqlite3.Row | None:
    with closing(db()) as connection:
        return connection.execute(
            "SELECT rating, success_orders, success_volume FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()


def set_user_stats(user_id: int, orders: int, rating: float, volume: float = 0) -> None:
    with closing(db()) as connection:
        connection.execute(
            """
            INSERT INTO users(id, rating, success_orders, success_volume)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                rating = excluded.rating,
                success_orders = excluded.success_orders,
                success_volume = excluded.success_volume
            """,
            (user_id, rating, orders, volume),
        )
        connection.commit()


def increment_success_orders(user_id: int, amount: float = 0) -> None:
    with closing(db()) as connection:
        connection.execute(
            """
            INSERT INTO users(id, success_orders, success_volume)
            VALUES(?, 1, ?)
            ON CONFLICT(id) DO UPDATE SET
                success_orders = success_orders + 1,
                success_volume = success_volume + excluded.success_volume
            """,
            (user_id, amount),
        )
        connection.commit()


def get_user_profile_row(user_id: int) -> sqlite3.Row | None:
    with closing(db()) as connection:
        return connection.execute(
            "SELECT id, username, first_name, rating, success_orders, success_volume FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()


def top_users(order_by: str = "orders", limit: int = 10) -> list[sqlite3.Row]:
    column = "success_volume" if order_by == "volume" else "success_orders"
    with closing(db()) as connection:
        return connection.execute(
            f"""
            SELECT id, username, first_name, rating, success_orders, success_volume
            FROM users
            WHERE success_orders > 0 OR success_volume > 0
            ORDER BY {column} DESC, success_orders DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()


def remember_user(user_id: int, username: str, first_name: str) -> None:
    with closing(db()) as connection:
        connection.execute(
            """
            INSERT INTO users(id, username, first_name)
            VALUES(?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                first_name = excluded.first_name
            """,
            (user_id, username or "", first_name or ""),
        )
        connection.commit()


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
def get_setting(key: str, default: str = "") -> str:
    with closing(db()) as connection:
        row = connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    with closing(db()) as connection:
        connection.execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        connection.commit()


# ---------------------------------------------------------------------------
# Balances
# ---------------------------------------------------------------------------
def record_balance_history(user_id, amount, currency, operation, reason, deal_tag=None, actor_id=None) -> None:
    with closing(db()) as connection:
        connection.execute(
            """
            INSERT INTO balance_history(user_id, currency, amount, operation, reason, deal_tag, actor_id)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, currency, amount, operation, reason, deal_tag, actor_id),
        )
        connection.commit()


def add_balance(user_id, amount, currency, reason="manual_topup", deal_tag=None, actor_id=None) -> None:
    with closing(db()) as connection:
        connection.execute(
            """
            INSERT INTO balances(user_id, currency, amount)
            VALUES(?, ?, ?)
            ON CONFLICT(user_id, currency) DO UPDATE SET amount = amount + excluded.amount
            """,
            (user_id, currency, amount),
        )
        connection.commit()
    record_balance_history(user_id, amount, currency, "credit", reason, deal_tag, actor_id)


def withdraw_balance(user_id: int, amount: float, currency: str) -> bool:
    """Reserve a withdrawal immediately, without allowing a negative balance."""
    with closing(db()) as connection:
        cursor = connection.execute(
            """
            UPDATE balances
            SET amount = amount - ?
            WHERE user_id = ? AND currency = ? AND amount >= ?
            """,
            (amount, user_id, currency, amount),
        )
        if cursor.rowcount != 1:
            connection.rollback()
            return False
        connection.execute(
            """
            INSERT INTO balance_history(user_id, currency, amount, operation, reason)
            VALUES(?, ?, ?, 'debit', 'withdrawal_request')
            """,
            (user_id, currency, -amount),
        )
        connection.commit()
    return True


def get_balance(user_id: int, currency: str) -> float:
    with closing(db()) as connection:
        row = connection.execute(
            "SELECT amount FROM balances WHERE user_id = ? AND currency = ?",
            (user_id, currency),
        ).fetchone()
    return float(row["amount"]) if row else 0.0


def get_balances(user_id: int) -> dict:
    with closing(db()) as connection:
        rows = connection.execute(
            "SELECT currency, amount FROM balances WHERE user_id = ? ORDER BY currency",
            (user_id,),
        ).fetchall()
    known = {row["currency"]: float(row["amount"]) for row in rows}
    return {currency: known.get(currency, 0.0) for currency in CURRENCIES}


def balance_history(user_id: int, limit: int = 10) -> list[dict]:
    with closing(db()) as connection:
        rows = connection.execute(
            """
            SELECT amount, currency, operation, reason, deal_tag,
                   datetime(created_at, '+3 hours') AS created_at
            FROM balance_history
            WHERE user_id = ?
              AND (reason != 'withdrawal_request' OR created_at >= datetime('now', '-1 hour'))
            ORDER BY id DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


# ---------------------------------------------------------------------------
# Encrypted payout requisites
# ---------------------------------------------------------------------------
def requisites_ready() -> bool:
    try:
        _requisites_cipher()
        return True
    except RuntimeError:
        return False


def get_requisites(user_id: int) -> dict[str, dict]:
    cipher = _requisites_cipher()
    with closing(db()) as connection:
        rows = connection.execute(
            "SELECT currency, kind, label, encrypted_value, updated_at FROM payout_requisites WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    result = {}
    for row in rows:
        try:
            value = cipher.decrypt(row["encrypted_value"].encode()).decode()
        except (InvalidToken, UnicodeDecodeError):
            continue
        result[row["currency"]] = {"kind": row["kind"], "label": row["label"], "value": value, "updated_at": row["updated_at"]}
    return result


def has_requisites(user_id: int, currency: str) -> bool:
    with closing(db()) as connection:
        row = connection.execute(
            "SELECT 1 FROM payout_requisites WHERE user_id = ? AND currency = ?", (user_id, currency)
        ).fetchone()
    return bool(row)


def save_requisites(user_id: int, currency: str, kind: str, label: str, value: str) -> None:
    encrypted = _requisites_cipher().encrypt(value.strip().encode()).decode()
    with closing(db()) as connection:
        connection.execute(
            """INSERT INTO payout_requisites(user_id, currency, kind, label, encrypted_value)
               VALUES(?, ?, ?, ?, ?)
               ON CONFLICT(user_id, currency) DO UPDATE SET kind=excluded.kind, label=excluded.label,
                 encrypted_value=excluded.encrypted_value, updated_at=CURRENT_TIMESTAMP""",
            (user_id, currency, kind, label.strip(), encrypted),
        )
        connection.commit()


def delete_requisites(user_id: int, currency: str) -> None:
    with closing(db()) as connection:
        connection.execute("DELETE FROM payout_requisites WHERE user_id = ? AND currency = ?", (user_id, currency))
        connection.commit()


# ---------------------------------------------------------------------------
# Deals
# ---------------------------------------------------------------------------
def create_tag() -> str:
    return "LG" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def save_deal(data: dict, seller_id: int, seller_username: str) -> Deal:
    tag = create_tag()
    deal = Deal(
        tag=tag,
        seller_id=seller_id,
        seller_username=seller_username,
        buyer_username=data["buyer_username"].lstrip("@"),
        item_type=data["item_type"],
        item_link=data["item_link"],
        amount=float(data["amount"]),
        currency=data["currency"],
        stars_count=data.get("stars_count"),
        status="created",
    )
    with closing(db()) as connection:
        connection.execute(
            """
            INSERT INTO deals(tag, seller_id, seller_username, buyer_username, item_type,
                item_link, amount, currency, stars_count, status)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (deal.tag, deal.seller_id, deal.seller_username, deal.buyer_username, deal.item_type,
             deal.item_link, deal.amount, deal.currency, deal.stars_count, deal.status),
        )
        connection.commit()
    return deal


def find_deal(tag: str) -> Deal | None:
    with closing(db()) as connection:
        row = connection.execute("SELECT * FROM deals WHERE tag = ?", (tag,)).fetchone()
    if not row:
        return None
    return Deal(
        tag=row["tag"], seller_id=row["seller_id"], seller_username=row["seller_username"],
        buyer_username=row["buyer_username"], item_type=row["item_type"], item_link=row["item_link"],
        amount=row["amount"], currency=row["currency"], stars_count=row["stars_count"], status=row["status"],
    )


def user_deals(user_id: int, username: str, limit: int = 12) -> list[Deal]:
    """Recent deals where the user is the seller or assigned buyer."""
    with closing(db()) as connection:
        rows = connection.execute(
            """SELECT tag, seller_id, seller_username, buyer_username, item_type, item_link,
                      amount, currency, stars_count, status
               FROM deals WHERE seller_id = ? OR lower(buyer_username) = ?
               ORDER BY created_at DESC LIMIT ?""",
            (user_id, (username or "").lower(), limit),
        ).fetchall()
    return [Deal(**dict(row)) for row in rows]


def pay_deal_from_balance(tag: str, user_id: int) -> tuple[bool, str]:
    with closing(db()) as connection:
        row = connection.execute("SELECT * FROM deals WHERE tag = ?", (tag,)).fetchone()
        if not row:
            return False, "deal_not_found"
        if row["status"] == "paid":
            return False, "already_paid"
        amount = float(row["amount"])
        current = get_balance(user_id, row["currency"])
        if current < amount:
            return False, "insufficient_funds"
        connection.execute(
            "UPDATE balances SET amount = amount - ? WHERE user_id = ? AND currency = ?",
            (amount, user_id, row["currency"]),
        )
        connection.execute("UPDATE deals SET status = 'paid' WHERE tag = ?", (tag,))
        connection.commit()
        record_balance_history(user_id, -amount, row["currency"], "debit", "deal_payment", tag)
    return True, "ok"


def release_deal_to_seller(tag: str) -> tuple[bool, str, Deal | None]:
    deal = find_deal(tag)
    if not deal:
        return False, "deal_not_found", None
    if deal.status == "completed":
        return False, "already_completed", deal
    if deal.status != "paid":
        return False, "not_paid", deal
    add_balance(deal.seller_id, deal.amount, deal.currency, reason="deal_release", deal_tag=deal.tag)
    increment_success_orders(deal.seller_id, deal.amount)
    with closing(db()) as connection:
        connection.execute("UPDATE deals SET status = 'completed' WHERE tag = ?", (tag,))
        connection.commit()
    return True, "ok", deal


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------
def is_admin(user_id: int) -> bool:
    if user_id in ADMIN_IDS:
        return True
    with closing(db()) as connection:
        row = connection.execute("SELECT user_id FROM admins WHERE user_id = ?", (user_id,)).fetchone()
    return bool(row)


def is_owner(user_id: int) -> bool:
    return user_id in ADMIN_IDS


def is_staff(user_id: int) -> bool:
    return is_admin(user_id) or user_id in WORKER_IDS


def add_admin(user_id: int, added_by: int, display_name: str = "") -> None:
    with closing(db()) as connection:
        connection.execute(
            """INSERT INTO admins(user_id, added_by, display_name) VALUES(?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET
                 display_name = CASE WHEN excluded.display_name != '' THEN excluded.display_name ELSE admins.display_name END""",
            (user_id, added_by, display_name.strip()),
        )
        connection.commit()


def update_admin_name(user_id: int, display_name: str) -> bool:
    with closing(db()) as connection:
        cursor = connection.execute(
            "UPDATE admins SET display_name = ? WHERE user_id = ?", (display_name.strip(), user_id)
        )
        connection.commit()
    return cursor.rowcount > 0


def admin_user_ids() -> list[int]:
    ids = set(ADMIN_IDS)
    with closing(db()) as connection:
        rows = connection.execute("SELECT user_id FROM admins").fetchall()
    ids.update(int(row["user_id"]) for row in rows)
    return sorted(ids)


def team_members() -> list[dict]:
    """All owners and panel-created administrators with their public profile."""
    owners = set(ADMIN_IDS)
    with closing(db()) as connection:
        rows = connection.execute(
            """SELECT a.user_id, a.added_by, a.display_name, a.created_at, u.username, u.first_name
               FROM admins a LEFT JOIN users u ON u.id = a.user_id
               ORDER BY a.created_at ASC"""
        ).fetchall()
        data = {int(row["user_id"]): dict(row) for row in rows}
        for owner_id in owners:
            profile = connection.execute(
                "SELECT username, first_name FROM users WHERE id = ?", (owner_id,)
            ).fetchone()
            data.setdefault(owner_id, {
                "user_id": owner_id, "added_by": None, "display_name": "", "created_at": None,
                "username": profile["username"] if profile else "",
                "first_name": profile["first_name"] if profile else "",
            })
    members = []
    for member_id, row in data.items():
        members.append({
            "id": member_id, "username": row.get("username") or "",
            "first_name": row.get("first_name") or "", "display_name": row.get("display_name") or "", "added_by": row.get("added_by"),
            "created_at": row.get("created_at"), "role": "owner" if member_id in owners else "admin",
            "removable": member_id not in owners,
        })
    return sorted(members, key=lambda member: (member["role"] != "owner", member["id"]))


def remove_admin(user_id: int) -> bool:
    """Remove only a database-created administrator, never an owner from config."""
    if user_id in ADMIN_IDS:
        return False
    with closing(db()) as connection:
        cursor = connection.execute("DELETE FROM admins WHERE user_id = ?", (user_id,))
        connection.commit()
    return cursor.rowcount > 0


def admin_user_deals(user_id: int, username: str = "", limit: int = 20) -> list[Deal]:
    """Recent deals belonging to a team member as seller or named buyer."""
    username = (username or "").lower()
    with closing(db()) as connection:
        rows = connection.execute(
            """SELECT tag, seller_id, seller_username, buyer_username, item_type, item_link,
                      amount, currency, stars_count, status
               FROM deals
               WHERE seller_id = ? OR (? != '' AND lower(buyer_username) = ?)
               ORDER BY created_at DESC LIMIT ?""",
            (user_id, username, username, limit),
        ).fetchall()
    return [Deal(**dict(row)) for row in rows]


def active_deals(limit: int = 40) -> list[Deal]:
    with closing(db()) as connection:
        rows = connection.execute(
            """SELECT tag, seller_id, seller_username, buyer_username, item_type, item_link,
                      amount, currency, stars_count, status
               FROM deals WHERE status IN ('created', 'paid')
               ORDER BY CASE status WHEN 'paid' THEN 0 ELSE 1 END, created_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    return [Deal(**dict(row)) for row in rows]


def active_deal_summary() -> dict:
    with closing(db()) as connection:
        rows = connection.execute(
            "SELECT status, COUNT(*) AS count FROM deals WHERE status IN ('created', 'paid') GROUP BY status"
        ).fetchall()
    counts = {row["status"]: int(row["count"]) for row in rows}
    return {"created": counts.get("created", 0), "paid": counts.get("paid", 0)}


def deal_workspaces(tags: list[str]) -> dict[str, dict]:
    if not tags:
        return {}
    marks = ",".join("?" for _ in tags)
    with closing(db()) as connection:
        rows = connection.execute(
            f"SELECT deal_tag, assigned_admin_id, note, updated_by, updated_at FROM deal_workspace WHERE deal_tag IN ({marks})",
            tags,
        ).fetchall()
    return {row["deal_tag"]: dict(row) for row in rows}


def set_deal_workspace(tag: str, assigned_admin_id: int | None, note: str, updated_by: int) -> None:
    with closing(db()) as connection:
        connection.execute(
            """INSERT INTO deal_workspace(deal_tag, assigned_admin_id, note, updated_by)
               VALUES(?, ?, ?, ?)
               ON CONFLICT(deal_tag) DO UPDATE SET assigned_admin_id = excluded.assigned_admin_id,
                 note = excluded.note, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP""",
            (tag, assigned_admin_id, note.strip(), updated_by),
        )
        connection.commit()
