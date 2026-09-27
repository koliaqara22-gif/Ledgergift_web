"""Pure presentation helpers shared by the API."""


def money(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:.2f}"


def seller_level(orders: int, volume: float, lang: str = "ru") -> dict:
    """Return {key, label} for the seller level, localized for ru/en."""
    if orders >= 100 or volume >= 100000:
        key, ru, en = "legend", "\U0001F3C6 \u041b\u0435\u0433\u0435\u043d\u0434\u0430 LedgerGift", "\U0001F3C6 Legend Seller"
    elif orders >= 30 or volume >= 30000:
        key, ru, en = "top", "\U0001F525 \u0422\u043e\u043f \u043f\u0440\u043e\u0434\u0430\u0432\u0435\u0446", "\U0001F525 Top Seller"
    elif orders >= 10 or volume >= 10000:
        key, ru, en = "trusted", "\u2705 \u041d\u0430\u0434\u0451\u0436\u043d\u044b\u0439 \u043f\u0440\u043e\u0434\u0430\u0432\u0435\u0446", "\u2705 Trusted Seller"
    else:
        key, ru, en = "new", "\U0001F331 \u041d\u0430\u0447\u0438\u043d\u0430\u044e\u0449\u0438\u0439 \u043f\u0440\u043e\u0434\u0430\u0432\u0435\u0446", "\U0001F331 New Seller"
    return {"key": key, "label": en if lang == "en" else ru}


def public_name(row) -> str:
    keys = row.keys() if hasattr(row, "keys") else row
    username = row["username"] if "username" in keys else ""
    first_name = row["first_name"] if "first_name" in keys else ""
    if username:
        return f"@{username}"
    if first_name:
        return first_name
    return f"ID {row['id']}"
