"""Shared, env-driven configuration.

Host-agnostic (epic Q5): every secret/host setting comes from an environment
variable so the same code runs on Vercel, a container host, or locally with
only config changes. Dev/prod specialise this module.
"""
from __future__ import annotations

import os
from pathlib import Path

import dj_database_url

# progresso/settings/base.py -> project root is three parents up.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECRET_KEY is required from the environment; dev.py supplies a dev default.
SECRET_KEY = os.environ["SECRET_KEY"]

# Overridden per environment (dev: "*", prod: from env).
ALLOWED_HOSTS: list[str] = []

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Serve static + the built SPA from the one Django service (P8 §5.10, AC-13).
    # Must sit right after SecurityMiddleware and before everything else.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django.middleware.locale.LocaleMiddleware",
]

ROOT_URLCONF = "progresso.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "progresso.wsgi.application"
ASGI_APPLICATION = "progresso.asgi.application"

# The single custom user model — set before the first migration (greenfield).
AUTH_USER_MODEL = "core.CustomUser"

# Database: parse DATABASE_URL; fall back to local SQLite when unset (dev).
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# DRF: session auth only for MVP (epic Q2, no JWT). Locked down by default;
# the public onboarding views (register, login, trainers) override to AllowAny.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # Bounded list responses (epic NFR §7); lists return the standard
    # {count, next, previous, results} envelope. Only affects generic
    # views/viewsets — hand-rolled APIView.get responses are unaffected.
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    # Rate-limit auth (P8 §5.7, AC-6). ScopedRateThrottle only throttles views
    # that declare ``throttle_scope`` (login + register set "auth"); every other
    # view — including chat polling — has no scope, so the throttle is inert
    # there. No global Anon/User throttle: that would throttle the chat poll.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "auth": "10/min",
    },
}

# i18n (epic Q6): EN base, SK complete; backend messages translatable.
LANGUAGE_CODE = "en"
LANGUAGES = [
    ("en", "English"),
    ("sk", "Slovenčina"),
]
LOCALE_PATHS = [BASE_DIR / "locale"]
USE_I18N = True
USE_TZ = True
TIME_ZONE = "UTC"

STATIC_URL = "static/"
# collectstatic target for admin/DRF assets (served by WhiteNoise in prod).
STATIC_ROOT = BASE_DIR / "staticfiles"
# WhiteNoise also serves the built SPA — Vite-hashed ``dist/assets``, the PWA
# manifest/service-worker, icons — straight from ``frontend/dist`` at the site
# root, so one Django service serves both the API and the app (host-agnostic,
# epic Q5). The SPA *index* is served by ``progresso.spa``; WhiteNoise fills the
# ``/assets`` gap its comment named. Inert in dev (Vite serves the SPA).
WHITENOISE_ROOT = BASE_DIR / "frontend" / "dist"

# Media (P3): used only by the Blob client's local-dev filesystem fallback,
# active when ``BLOB_READ_WRITE_TOKEN`` is unset (§5.2/§5.8). Prod sets the token
# and never touches the local FS. ``media/`` is gitignored (no data files in git).
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
