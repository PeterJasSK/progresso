"""Blob delete-on-delete — closes the orphaned-blob leak (P3, §5.5, AC-3).

The known bug: "Blob delete never wired to measurement deletion. Orphaned blobs
-> storage leak + cost" (rebuild-analysis.md §2 #9). Fixed with a ``post_delete``
receiver on :class:`Measurement`, which fires for **both** a direct
``Measurement.delete()`` **and** a cascade delete when the owning trainee is
removed (``on_delete=CASCADE``) — the single mechanism satisfying both AC-3
clauses. A ``save()``/``delete()`` model override would miss the cascade path,
which is exactly the bug being fixed.

The receiver is registered when this module is imported from
``CoreConfig.ready()`` (``core/apps.py``).

Cleanup is best-effort synchronous in-request (no task queue in MVP): a failed
Blob delete is logged and swallowed so it never blocks the DB delete. A periodic
orphan sweep is post-MVP (§8).
"""
from __future__ import annotations

import logging
from typing import Iterable

from django.db.models.signals import post_delete
from django.dispatch import receiver

from core.models import Measurement
from core.services import blob

logger = logging.getLogger(__name__)


def delete_blob_urls(urls: Iterable[str]) -> None:
    """Best-effort delete each non-empty URL; log and swallow failures."""
    for url in urls:
        if not url:
            continue
        try:
            blob.delete(url)
        except Exception:  # noqa: BLE001 — cleanup must never block the caller.
            logger.warning("Blob delete failed for %s", url, exc_info=True)


def delete_photo_blobs(measurement: Measurement) -> None:
    """Delete a measurement's photo + thumbnail blobs, if any."""
    delete_blob_urls([measurement.photo_url, measurement.thumbnail_url])


@receiver(post_delete, sender=Measurement)
def _cleanup_on_delete(sender, instance: Measurement, **kwargs) -> None:
    delete_photo_blobs(instance)
