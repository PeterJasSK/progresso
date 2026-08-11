"""WSGI config for the progresso project."""
from __future__ import annotations

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "progresso.settings.dev")

application = get_wsgi_application()
