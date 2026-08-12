# Progresso — single-service container (P8 §5.10, host-agnostic proof, epic Q5).
#
# One image serves BOTH the DRF API and the built React SPA (WhiteNoise), so
# moving off Vercel to any container host is `docker build` + env vars, not a
# rewrite. All host/secret config comes from the environment.
#
#   docker build -t progresso .
#   docker run -p 8000:8000 \
#     -e SECRET_KEY=... \
#     -e DATABASE_URL=postgres://... \
#     -e BLOB_READ_WRITE_TOKEN=... \
#     -e ALLOWED_HOSTS=your.host \
#     -e DJANGO_SETTINGS_MODULE=progresso.settings.prod \
#     progresso

# --- Stage 1: build the SPA ---------------------------------------------------
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build            # -> /app/frontend/dist

# --- Stage 2: Python runtime --------------------------------------------------
FROM python:3.13-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=progresso.settings.prod

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# The built SPA from stage 1 — WhiteNoise serves frontend/dist at the site root.
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Collect admin/DRF static into STATIC_ROOT (WhiteNoise serves it in prod).
# SECRET_KEY is required at import time; a throwaway build-time value is fine —
# collectstatic touches no secrets.
RUN SECRET_KEY=build-only DATABASE_URL=sqlite:// BLOB_READ_WRITE_TOKEN=build-only \
    python manage.py collectstatic --noinput

EXPOSE 8000
# Run DB migrations, then serve. gunicorn is already a dependency.
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn progresso.wsgi:application --bind 0.0.0.0:8000"]
