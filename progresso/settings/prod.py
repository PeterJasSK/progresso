"""Production settings: DEBUG off, DATABASE_URL required, secure cookies, HTTPS.

All host-specific values come from the environment (epic Q5) so this runs
unchanged on Vercel or any container host.
"""
from __future__ import annotations

import os

from .base import *  # noqa: F401,F403

DEBUG = False

# Comma-separated hostnames from the environment, e.g. "app.example.com,www.example.com".
ALLOWED_HOSTS = [h for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h]

# DATABASE_URL must be set in prod (no SQLite fallback here).
if not os.environ.get("DATABASE_URL"):
    raise RuntimeError("DATABASE_URL is required in production.")

# Secure session/CSRF cookies over HTTPS (epic Q2).
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True

# Trust the proxy's X-Forwarded-Proto so SSL redirect works behind a load balancer.
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
