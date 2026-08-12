"""Vercel Python serverless entrypoint.

Vercel's Python runtime auto-detects a WSGI callable named ``app`` in files under
``/api``. It exposes the Django WSGI application; the SPA and its assets are served
as static files by Vercel's CDN (see ``vercel.json``), so only ``/api``, ``/admin``
and ``/static`` are routed here.
"""
from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "progresso.settings.prod")

from progresso.wsgi import application

app = application
