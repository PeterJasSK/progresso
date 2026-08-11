"""Thin session-auth views (epic §3: wiring only, logic in serializers).

MVP is session auth (epic Q2): login/logout set/clear the session cookie; no JWT.
Register, login and trainers are public (AllowAny) — the open onboarding surface
(§0). Error bodies carry translation *keys*, not prose (epic Q6).
"""
from __future__ import annotations

from django.contrib.auth import authenticate, login, logout
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import CustomUser, Measurement, Role
from core.api.permissions import MeasurementAccessPermission
from core.api.serializers import (
    MeasurementSerializer,
    RegisterSerializer,
    TrainerOptionSerializer,
    UserSerializer,
)


class RegisterView(APIView):
    """POST /auth/register — open self-registration + auto-login (§0, AC-7)."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # Auto-login: straight into the app (§0).
        login(request, user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class TrainersView(APIView):
    """GET /auth/trainers — public trainer picker list (§0, AC-8)."""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        trainers = CustomUser.objects.filter(role=Role.TRAINER).order_by(
            "first_name", "last_name", "username"
        )
        return Response(TrainerOptionSerializer(trainers, many=True).data)


class LoginView(APIView):
    """POST /auth/login — session login (AC-5)."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response(
                {"detail": "invalid_credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    """POST /auth/logout — clear the session (AC-5)."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(ensure_csrf_cookie, name="get")
class MeView(APIView):
    """GET /auth/me — current user; seeds the csrftoken cookie for the SPA (AC-5)."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response(UserSerializer(request.user).data)


class MeasurementViewSet(viewsets.ModelViewSet):
    """Measurements CRUD (P2). Thin: querysets, permissions, forced owner only.

    Access is resolved entirely through ``request.user.can_access`` via
    :class:`MeasurementAccessPermission` — no inline role/data-access branch
    here (epic §3, §10).
    """

    serializer_class = MeasurementSerializer
    permission_classes = [IsAuthenticated, MeasurementAccessPermission]

    def get_target_user(self, request: Request) -> CustomUser:
        """Resolve the user whose data is targeted — the ``CanAccessTarget``
        contract (permissions.py). ``?user=`` names a trainee; absent -> self.
        """
        user_id = request.query_params.get("user")
        if user_id is None:
            return request.user
        return get_object_or_404(CustomUser, pk=user_id)

    def get_queryset(self) -> QuerySet[Measurement]:
        user = self.request.user
        if self.action == "list":
            # Permission already asserted can_access(target); filter to it.
            target = self.get_target_user(self.request)
            return Measurement.objects.filter(user=target).select_related("user")

        # Detail actions: restrict to rows this caller may read so an
        # inaccessible id 404s (no existence leak, epic Q6); has_object_permission
        # then gates writes on rows that are readable but not owned. The scoping
        # rule lives on the model beside can_access — not re-encoded here (§10).
        return Measurement.objects.filter(
            user.accessible_data_filter("user")
        ).select_related("user")

    def perform_create(self, serializer: MeasurementSerializer) -> None:
        # Owner is forced to the caller — any ``user`` in the body is ignored.
        serializer.save(user=self.request.user)
