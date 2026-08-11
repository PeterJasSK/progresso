"""Root URLconf: Django admin plus the versioned API under /api/v1/."""
from __future__ import annotations

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("core.api.urls")),
]

# Serve the Blob filesystem-fallback media locally (dev only, §5.2). In prod the
# Blob client returns absolute Blob URLs, so this is inert.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
