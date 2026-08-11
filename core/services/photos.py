"""Photo validation + thumbnail + Blob upload orchestration (P3, §5.3).

The single entry point the serializer calls on create/update. It is a service,
not a view — no DRF imports; it raises plain exceptions the serializer maps to
translation *keys* (``invalid_image``, ``photo_too_large``; epic Q6).

"Thumbnail on save" (AC-2) is satisfied here, at the serializer boundary: the
upload is normalized to JPEG, a thumbnail is generated, and both are pushed to
Blob — all in memory, since the serverless FS is ephemeral (epic §3).
"""
from __future__ import annotations

import uuid
from io import BytesIO

from PIL import Image, UnidentifiedImageError

from core.services import blob

# Upload ceiling + thumbnail box (epic §11 Q2). Thumbnail preserves aspect ratio
# (``Image.thumbnail`` fits within the box). Accept JPEG/PNG/WebP in, normalize
# to JPEG out (Q3) — smaller and universal.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
THUMBNAIL_SIZE = (400, 400)
_JPEG_QUALITY = 85
_CONTENT_TYPE = "image/jpeg"


class InvalidImage(ValueError):
    """Uploaded file is not a decodable image."""


class PhotoTooLarge(ValueError):
    """Uploaded file exceeds ``MAX_UPLOAD_BYTES``."""


def process_upload(file, owner_id: int) -> tuple[str, str]:
    """Validate, thumbnail, and upload ``file``; return ``(photo_url, thumb_url)``.

    ``file`` is the uploaded file object from the serializer. Raises
    :class:`PhotoTooLarge` / :class:`InvalidImage` on rejection.
    """
    size = getattr(file, "size", None)
    if size is not None and size > MAX_UPLOAD_BYTES:
        raise PhotoTooLarge()

    file.seek(0)
    try:
        # verify() confirms the file is a real image but consumes it, so the
        # image must be re-opened afterwards to actually read pixels.
        Image.open(file).verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise InvalidImage() from exc

    file.seek(0)
    try:
        image = Image.open(file)
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise InvalidImage() from exc

    full_bytes = _encode(image)

    thumb = image.copy()
    thumb.thumbnail(THUMBNAIL_SIZE)
    thumb_bytes = _encode(thumb)

    key = uuid.uuid4().hex
    photo_url = blob.put(
        f"photos/{owner_id}/{key}.jpg", full_bytes, _CONTENT_TYPE
    )
    thumbnail_url = blob.put(
        f"photos/{owner_id}/{key}_thumb.jpg", thumb_bytes, _CONTENT_TYPE
    )
    return photo_url, thumbnail_url


def _encode(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=_JPEG_QUALITY)
    return buffer.getvalue()
