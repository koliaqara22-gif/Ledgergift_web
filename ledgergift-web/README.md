# LedgerGift Web

Отдельная веб-версия LedgerGift. Мини-приложение в `ledgergift-miniapp/` не используется и не изменяется.

## Запуск

```bash
pip install -r requirements.txt
uvicorn app:app --reload
```

Сайт откроется на `http://127.0.0.1:8000`.

## Сценарий сделки

Продавец создаёт сделку и передаёт покупателю ссылку. Покупатель регистрируется, присоединяется к сделке, подтверждает оплату. После этого продавец видит инструкцию вернуться в чат с покупателем и передать подарок. Покупатель подтверждает получение — сделка завершается.

В текущей версии действие оплаты — демонстрационный шаг. Для реальных платежей подключите провайдера и меняйте статус `paid` только из проверенного webhook.
# LedgerGift web

## Cloudflare Pages address without the account name

Deploy this repository in **Cloudflare Pages** with these values:

- Root directory: `ledgergift-web`
- Build command: leave empty
- Build output directory: `static`
- D1 binding: `DB` → the existing `ledgergift` database
- Runtime variable: `OWNER_NICKNAME=admin228`

The `functions/api/[[path]].js` adapter makes Pages call the same Worker API,
so all accounts, balances, deals and admins continue to use the existing D1 database.
