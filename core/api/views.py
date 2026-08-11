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
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import CustomUser, Goal, Measurement, Role
from core.api.permissions import (
    GoalAccessPermission,
    MeasurementAccessPermission,
)
from core.services import chart_data
from core.api.serializers import (
    GoalSerializer,
    MeasurementSerializer,
    RegisterSerializer,
    TrainerOptionSerializer,
    UserSerializer,
)


class TargetUserMixin:
    """Resolve the user whose data a request targets — the ``CanAccessTarget``
    contract (permissions.py). ``?user=`` names a trainee; absent -> self.

    Shared by every domain viewset so the resolution rule is not copy-pasted
    (epic §3, §10).
    """

    def get_target_user(self, request: Request) -> CustomUser:
        user_id = request.query_params.get("user")
        if user_id is None:
            return request.user
        return get_object_or_404(CustomUser, pk=user_id)


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


class MeasurementViewSet(TargetUserMixin, viewsets.ModelViewSet):
    """Measurements CRUD (P2). Thin: querysets, permissions, forced owner only.

    Access is resolved entirely through ``request.user.can_access`` via
    :class:`MeasurementAccessPermission` — no inline role/data-access branch
    here (epic §3, §10). ``get_target_user`` comes from :class:`TargetUserMixin`.
    """

    serializer_class = MeasurementSerializer
    permission_classes = [IsAuthenticated, MeasurementAccessPermission]
    # Accept the multipart photo POST/PATCH alongside JSON. DRF's global default
    # already includes these; set them explicitly so the contract is legible and
    # independent of settings (§5.6).
    parser_classes = [MultiPartParser, FormParser, JSONParser]

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

    def photos(self, request: Request) -> Response:
        """GET /measurements/photos?user=:id — the P7 compare-picker feed (AC-5).

        Lists only measurements that have a photo, gated by the same
        ``can_access`` predicate as ``list`` (``get_target_user`` +
        :class:`MeasurementAccessPermission`). Payload already carries
        ``photo_url``/``thumbnail_url`` + dates + id — everything the picker
        needs. Bytes come straight from the Blob public URL (no proxy).
        """
        target = self.get_target_user(request)
        queryset = (
            Measurement.objects.filter(user=target)
            .exclude(photo_url="")
            .select_related("user")
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def series(self, request: Request) -> Response:
        """GET /measurements/series?user=:id — server-computed chart series (P4).

        Same ``can_access`` gate as ``list``/``photos`` (``get_target_user`` +
        :class:`MeasurementAccessPermission`). Thin: resolve the target, pull the
        history **ascending** for the chart axis, hand it to the chart-data
        service, return its dict. Not paginated — the whole history feeds one
        chart (§5.5). All BMI/delta/trend math lives in the services layer.
        """
        target = self.get_target_user(request)
        measurements = (
            Measurement.objects.filter(user=target)
            .select_related("user")
            .order_by("measured_at", "created_at")
        )
        return Response(chart_data.build_series(measurements))


class GoalViewSet(TargetUserMixin, viewsets.ModelViewSet):
    """Goals list/create (P6). Thin: querysets, permissions, forced owner only.

    Access is resolved entirely through ``request.user.can_access`` via
    :class:`GoalAccessPermission` (epic §3). P6 wires only ``list`` + ``create``;
    the ``partial_update`` toggle-complete route is P7 (the permission already
    admits it).
    """

    serializer_class = GoalSerializer
    permission_classes = [IsAuthenticated, GoalAccessPermission]
    parser_classes = [JSONParser]

    def get_queryset(self) -> QuerySet[Goal]:
        # Permission already asserted can_access(target); filter to it.
        target = self.get_target_user(self.request)
        return Goal.objects.filter(user=target).select_related("user")

    def perform_create(self, serializer: GoalSerializer) -> None:
        # Owner is forced to the caller — any ``user`` in the body is ignored.
        serializer.save(user=self.request.user)
