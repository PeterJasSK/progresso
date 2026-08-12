"""API URLconf, mounted under /api/v1/ by the project root URLconf."""
from __future__ import annotations

from django.urls import path

from core.api.views import (
    GoalViewSet,
    LoginView,
    LogoutView,
    MeasurementViewSet,
    MeView,
    RegisterView,
    TraineeViewSet,
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
_measurement_photos = MeasurementViewSet.as_view({"get": "photos"})
_measurement_series = MeasurementViewSet.as_view({"get": "series"})
# P6: goals list/create. P7 adds the ``goals/<int:pk>`` PATCH toggle-complete
# route — owner trainee or owning trainer flips ``is_completed``.
_goal_list = GoalViewSet.as_view({"get": "list", "post": "create"})
_goal_detail = GoalViewSet.as_view({"patch": "partial_update"})
# P7 roster: list own trainees + one trainee summary (trainer-only, read-only).
_trainee_list = TraineeViewSet.as_view({"get": "list"})
_trainee_detail = TraineeViewSet.as_view({"get": "retrieve"})

urlpatterns = [
    path("auth/register", RegisterView.as_view(), name="auth-register"),
    path("auth/trainers", TrainersView.as_view(), name="auth-trainers"),
    path("auth/login", LoginView.as_view(), name="auth-login"),
    path("auth/logout", LogoutView.as_view(), name="auth-logout"),
    path("auth/me", MeView.as_view(), name="auth-me"),
    path("measurements", _measurement_list, name="measurement-list"),
    # Literal ``photos`` before the pk route: it can't match ``<int:pk>`` anyway,
    # but ordering it first keeps intent obvious and pre-empts a future non-int
    # pk change (§5.7).
    path("measurements/photos", _measurement_photos, name="measurement-photos"),
    path("measurements/series", _measurement_series, name="measurement-series"),
    path(
        "measurements/<int:pk>",
        _measurement_detail,
        name="measurement-detail",
    ),
    path("goals", _goal_list, name="goal-list"),
    path("goals/<int:pk>", _goal_detail, name="goal-detail"),
    path("trainees", _trainee_list, name="trainee-list"),
    path("trainees/<int:pk>", _trainee_detail, name="trainee-detail"),
]
