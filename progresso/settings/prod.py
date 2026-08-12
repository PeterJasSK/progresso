"""Production settings: DEBUG off, Postgres required, secure cookies, HTTPS.

All host-specific values come from the environment (epic Q5) so this runs
unchanged on Vercel or any container host. Vercel Postgres (Neon) injects
``POSTGRES_URL`` rather than ``DATABASE_URL``; we accept either.
"""
from __future__ import annotations

import os

# Vercel Postgres injects POSTGRES_URL; a container host typically sets
# DATABASE_URL. Normalise to DATABASE_URL *before* base.py reads it.
if not os.environ.get("DATABASE_URL") and os.environ.get("POSTGRES_URL"):
    os.environ["DATABASE_URL"] = os.environ["POSTGRES_URL"]

from .base import *  # noqa: E402,F401,F403

import dj_database_url  # noqa: E402

DEBUG = False

# Comma-separated hostnames from the environment, e.g. "app.example.com,www.example.com".
ALLOWED_HOSTS = [h for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h]

# A Postgres URL must be set in prod (no SQLite fallback here).
if not os.environ.get("DATABASE_URL"):
    raise RuntimeError(
        "DATABASE_URL (or POSTGRES_URL on Vercel) is required in production."
    )

# Blob token must be set in prod: the serverless FS is ephemeral, so the local
# filesystem photo fallback (dev only) must never be reached here (P3, §11 Q1).
if not os.environ.get("BLOB_READ_WRITE_TOKEN"):
    raise RuntimeError("BLOB_READ_WRITE_TOKEN is required in production.")

# Serverless-safe DB config. conn_max_age=0: each function invocation is
# short-lived, so don't hold connections open. prepare_threshold=None disables
# psycopg3 server-side prepared statements, which break behind a transaction-mode
# pooler (Vercel Postgres / Neon pooled endpoint, PgBouncer). Harmless on a
# direct connection (container host), so this is safe for both deploy paths.
DATABASES = {
    "default": dj_database_url.parse(os.environ["DATABASE_URL"], conn_max_age=0),
}
DATABASES["default"].setdefault("OPTIONS", {})
DATABASES["default"]["OPTIONS"]["prepare_threshold"] = None

# CSRF: over HTTPS Django checks the request Origin against this list. The SPA is
# same-origin, so add the deployed origin(s) — comma-separated, scheme included,
# e.g. "https://your-app.vercel.app,https://app.example.com".
CSRF_TRUSTED_ORIGINS = [
    o for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if o
]

# Static serving. USE_FINDERS lets WhiteNoise serve admin/DRF static straight from
# the app's static dirs, so a `collectstatic` step is NOT required on hosts that
# don't run one (Vercel). Non-manifest storage: a manifest backend would raise on
# the missing staticfiles.json when collectstatic hasn't run. The container path
# still runs collectstatic (Dockerfile) and this storage handles that too.
WHITENOISE_USE_FINDERS = True
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

# Secure session/CSRF cookies over HTTPS (epic Q2).
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True

# Trust the proxy's X-Forwarded-Proto so SSL redirect works behind a load balancer
# / Vercel's edge (which terminates TLS and forwards the header).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Plain Django logging to stdout (no Sentry — epic §3).
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}
