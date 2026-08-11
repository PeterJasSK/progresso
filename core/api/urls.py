"""API URLconf, mounted under /api/v1/ by the project root URLconf."""
from __future__ import annotations

from django.urls import path

from core.api.views import (
    LoginView,
    LogoutView,
    MeasurementViewSet,
    MeView,
    RegisterView,
    TrainersView,
)

# Explicit paths (not a DefaultRouter) mirroring the P1 style and keeping the
# future ``measurements/series`` (P4) and ``measurements/photos`` (P3) literals
# collision-free with the pk route (plan §11 Q5).
_measurement_list = MeasurementViewSet.as_view(
    {"get": "list", "post": "create"}
)
_measurement_detail = MeasurementViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)

urlpatterns = [
    path("auth/register", RegisterView.as_view(), name="auth-register"),
    path("auth/trainers", TrainersView.as_view(), name="auth-trainers"),
    path("auth/login", LoginView.as_view(), name="auth-login"),
    path("auth/logout", LogoutView.as_view(), name="auth-logout"),
    path("auth/me", MeView.as_view(), name="auth-me"),
    path("measurements", _measurement_list, name="measurement-list"),
    path(
        "measurements/<int:pk>",
        _measurement_detail,
        name="measurement-detail",
    ),
]
