"""Vercel Blob HTTP client — dependency-free, lazy on the token (P3, §5.2).

A small, stdlib-only (``urllib``) client modelled on the pre-rebuild backend's
shape: "clean, dependency-free, correctly lazy on the token"
(rebuild-analysis.md §2). It is a pure I/O boundary — it never imports Django
models, so it stays unit-swappable and host-agnostic (epic Q5).

Token resolution is lazy: ``BLOB_READ_WRITE_TOKEN`` is read *inside* each call,
never at import, so the module imports fine in dev/CI without a token. When the
token is unset the client transparently falls back to Django's filesystem
storage under ``MEDIA_ROOT`` so ``runserver`` works with no Blob account (§5.2,
§11 Q1). Prod sets the token and always hits Blob; ``prod.py`` asserts it.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

# Vercel Blob HTTP API. The surface (host, headers, version) is small and lives
# only here, so pinning it against Vercel's current API is a one-file change.
_BASE_URL = "https://blob.vercel-storage.com"
_API_VERSION = "12"
_TOKEN_ENV = "BLOB_READ_WRITE_TOKEN"


class BlobUploadError(RuntimeError):
    """A Blob HTTP request failed (network or non-2xx response)."""


def _token() -> str | None:
    """The Blob RW token, or ``None`` (filesystem fallback). Read lazily."""
    token = os.environ.get(_TOKEN_ENV)
    return token or None


def put(pathname: str, data: bytes, content_type: str) -> str:
    """Upload ``data`` to Blob and return the public URL.

    With no token, writes under ``MEDIA_ROOT`` and returns a ``MEDIA_URL`` path
    (dev fallback). The random suffix is left on so URLs stay unguessable.
    """
    token = _token()
    if token is None:
        return _fs_put(pathname, data)

    request = urllib.request.Request(
        f"{_BASE_URL}/{pathname}",
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "x-api-version": _API_VERSION,
            "x-content-type": content_type,
            "x-add-random-suffix": "1",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Vercel Blob returns a JSON error body — log it verbatim so prod stdout
        # says *why* (bad token, wrong api-version, quota, etc.), not just the code.
        body = exc.read().decode("utf-8", "replace")
        logger.error("Blob upload failed for %s: HTTP %s %s", pathname, exc.code, body)
        raise BlobUploadError(f"HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        logger.exception("Blob upload failed for %s", pathname)
        raise BlobUploadError(str(exc)) from exc
    return payload["url"]


def delete(url: str) -> None:
    """Delete a blob by its public URL.

    Vercel Blob's delete is idempotent (a gone blob is not an error). With no
    token, unlinks the corresponding file under ``MEDIA_ROOT``.
    """
    token = _token()
    if token is None:
        _fs_delete(url)
        return

    body = json.dumps({"urls": [url]}).encode("utf-8")
    request = urllib.request.Request(
        f"{_BASE_URL}/delete",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "x-api-version": _API_VERSION,
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(request):
        return


def _fs_storage():
    """Django filesystem storage bound to ``MEDIA_ROOT``/``MEDIA_URL``."""
    from django.core.files.storage import FileSystemStorage

    return FileSystemStorage()


def _fs_put(pathname: str, data: bytes) -> str:
    from django.core.files.base import ContentFile

    storage = _fs_storage()
    saved = storage.save(pathname, ContentFile(data))
    return storage.url(saved)


def _fs_delete(url: str) -> None:
    from django.conf import settings

    prefix = settings.MEDIA_URL
    name = url[len(prefix):] if url.startswith(prefix) else url
    storage = _fs_storage()
    if storage.exists(name):
        storage.delete(name)
