"""Local development settings: DEBUG on, SQLite default, relaxed cookies."""
from __future__ import annotations

import os

# Supply a dev SECRET_KEY before base.py reads it (never used in prod).
os.environ.setdefault("SECRET_KEY", "dev-insecure-key-change-me")

from .base import *  # noqa: E402,F401,F403

DEBUG = True

ALLOWED_HOSTS = ["*"]

# Relaxed cookies for plain-HTTP local dev.
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
