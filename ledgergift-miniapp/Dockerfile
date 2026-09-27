FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY frontend ./frontend

ENV PYTHONUNBUFFERED=1

# Railway must run both the HTTP service and the Telegram long-polling bot.
# The API stays in the background while bot.py remains the main process.
CMD ["sh", "-c", "uvicorn main:app --app-dir /app/backend --host 0.0.0.0 --port ${PORT:-8080} & exec python /app/backend/bot.py"]
