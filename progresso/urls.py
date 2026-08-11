"""Root URLconf: Django admin plus the versioned API under /api/v1/."""
from __future__ import annotations

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path

from progresso.spa import spa_index

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("core.api.urls")),
]

# Serve the Blob filesystem-fallback media locally (dev only, §5.2). In prod the
# Blob client returns absolute Blob URLs, so this is inert.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Same-origin SPA catch-all (P5 §5.7). Must come last so admin/, api/v1/, static/ and
# media/ win; everything else is a client-side route and gets the SPA shell.
urlpatterns += [
    re_path(r"^(?!api/|admin/|static/|media/|assets/).*$", spa_index),
]
