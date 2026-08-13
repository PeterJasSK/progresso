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
import urllib.parse
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
    """Upload ``data`` to Blob (private) and return its store URL.

    The blob is marked **private** via ``x-vercel-blob-access: private`` (P13):
    the live store is a private store, which rejects a default-public PUT with
    ``400 "Cannot use public access on a private store."``. The returned URL is
    not world-readable — reads go through the authenticated :func:`get_bytes`
    proxy, gated by ``can_access``.

    With no token, writes under ``MEDIA_ROOT`` and returns a ``MEDIA_URL`` path
    (dev fallback). The random suffix is left on so URLs stay unguessable.
    """
    token = _token()
    if token is None:
        return _fs_put(pathname, data)

    # Blob API v12 takes the pathname as a ``?pathname=`` query param (URL-encoded,
    # slashes become %2F), not in the URL path — the PUT target is ``/?pathname=…``.
    # Sending it in the path makes the server read an empty pathname -> HTTP 400
    # "Invalid pathname". Mirrors the SDK's ``PUT /?${URLSearchParams({pathname})}``.
    query = urllib.parse.urlencode({"pathname": pathname})
    request = urllib.request.Request(
        f"{_BASE_URL}/?{query}",
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "x-api-version": _API_VERSION,
            "x-content-type": content_type,
            "x-add-random-suffix": "1",
            "x-vercel-blob-access": "private",
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


def get_bytes(url: str) -> bytes:
    """Fetch the bytes of a (private) blob by its store URL.

    A private blob is not world-readable, so the read is an authenticated GET
    (``Authorization: Bearer`` + ``x-api-version``) — the mirror of :func:`put`.
    With no token, reads from ``MEDIA_ROOT`` (stripping the ``MEDIA_URL`` prefix
    off the stored path), the dev filesystem fallback. HTTP/URL failures are
    wrapped in :class:`BlobUploadError` and logged verbatim.
    """
    token = _token()
    if token is None:
        return _fs_get(url)

    # Private blobs are read straight off the store's CDN host
    # (``<storeId>.private.blob.vercel-storage.com/<pathname>`` — exactly the URL
    # ``put`` returned) with only a Bearer token; no ``x-api-version`` (that is a
    # control-plane header, not a storage-GET one). Mirrors the SDK's ``get``.
    request = urllib.request.Request(
        url,
        method="GET",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(request) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        logger.error("Blob fetch failed for %s: HTTP %s %s", url, exc.code, body)
        raise BlobUploadError(f"HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        logger.exception("Blob fetch failed for %s", url)
        raise BlobUploadError(str(exc)) from exc


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


def _fs_get(url: str) -> bytes:
    from django.conf import settings

    prefix = settings.MEDIA_URL
    name = url[len(prefix):] if url.startswith(prefix) else url
    storage = _fs_storage()
    if not storage.exists(name):
        raise BlobUploadError(f"blob not found: {name}")
    with storage.open(name, "rb") as handle:
        return handle.read()


def _fs_delete(url: str) -> None:
    from django.conf import settings

    prefix = settings.MEDIA_URL
    name = url[len(prefix):] if url.startswith(prefix) else url
    storage = _fs_storage()
    if storage.exists(name):
        storage.delete(name)
