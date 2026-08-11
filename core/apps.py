"""App config for the single domain app."""
from __future__ import annotations

from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self) -> None:
        # Register the blob delete-on-delete ``post_delete`` receiver (P3, §5.5).
        from core.services import blob_cleanup  # noqa: F401
