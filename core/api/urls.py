"""API URLconf, mounted under /api/v1/ by the project root URLconf."""
from __future__ import annotations

from django.urls import path

from core.api.views import (
    LoginView,
    LogoutView,
    MeView,
    RegisterView,
    TrainersView,
)

urlpatterns = [
    path("auth/register", RegisterView.as_view(), name="auth-register"),
    path("auth/trainers", TrainersView.as_view(), name="auth-trainers"),
    path("auth/login", LoginView.as_view(), name="auth-login"),
    path("auth/logout", LogoutView.as_view(), name="auth-logout"),
    path("auth/me", MeView.as_view(), name="auth-me"),
]
