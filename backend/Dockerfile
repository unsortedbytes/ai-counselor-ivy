FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Settings require a MongoDB URI; collectstatic never connects, so a placeholder is fine.
RUN MONGODB_URI=mongodb://build-placeholder python manage.py collectstatic --noinput

EXPOSE 8000
# Migrate (also seeds the demo prompt) then serve. Threads let the background
# strategist run while gunicorn keeps answering polls.
# PORT is set by hosts like Render; WEB_CONCURRENCY lets small instances run 1 worker.
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --threads 8 --timeout 120"]
