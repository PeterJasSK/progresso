"""ASGI config for the progresso project (plain ASGI, no Channels)."""
from __future__ import annotations

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "progresso.settings.dev")

application = get_asgi_application()
