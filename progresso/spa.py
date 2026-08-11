"""Thin same-origin SPA serving (plan P5 §5.7, Q6 = same-origin).

Returns the built ``frontend/dist/index.html`` for any non-API, non-admin route so the
React client-side router owns navigation. No business logic lives here — it only hands
back the shell. Static asset serving for ``dist/assets`` (WhiteNoise) is deferred to P8;
in dev the SPA is served by the Vite dev server (which proxies ``/api`` to Django), so
this view is only exercised against a production build.
"""
from __future__ import annotations

from pathlib import Path

from django.http import HttpRequest, HttpResponse

_INDEX_HTML = Path(__file__).resolve().parent.parent / "frontend" / "dist" / "index.html"


def spa_index(_request: HttpRequest) -> HttpResponse:
    """Serve the built SPA shell; 404 with guidance if the frontend isn't built yet."""
    if not _INDEX_HTML.exists():
        return HttpResponse(
            "SPA not built. Run `npm run build` in frontend/, or use the Vite dev server.",
            status=404,
            content_type="text/plain",
        )
    return HttpResponse(_INDEX_HTML.read_text(encoding="utf-8"), content_type="text/html")
