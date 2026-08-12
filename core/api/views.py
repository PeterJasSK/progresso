"""Thin session-auth views (epic §3: wiring only, logic in serializers).

MVP is session auth (epic Q2): login/logout set/clear the session cookie; no JWT.
Register, login and trainers are public (AllowAny) — the open onboarding surface
(§0). Error bodies carry translation *keys*, not prose (epic Q6).
"""
from __future__ import annotations

from django.contrib.auth import authenticate, login, logout
from django.db.models import Q, QuerySet
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core.models import CustomUser, Goal, Measurement, Message, Role
from core.api.permissions import (
    GoalAccessPermission,
    MeasurementAccessPermission,
    MessageAccessPermission,
    TraineeRosterPermission,
)
from core.services import chart_data, roster
from core.api.serializers import (
    GoalSerializer,
    GoalToggleSerializer,
    LinkTrainerSerializer,
    MeasurementSerializer,
    MessageCreateSerializer,
    MessageSerializer,
    RegisterSerializer,
    RosterEntrySerializer,
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
    """POST /auth/register — open self-registration + auto-login (§0, AC-7).

    Rate-limited on the ``auth`` scope (P8 §5.7, AC-6) to blunt automated signup
    abuse; normal app traffic is un-throttled.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

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
    """POST /auth/login — session login (AC-5).

    Rate-limited on the ``auth`` scope (P8 §5.7, AC-6) so credential-stuffing is
    throttled; chat polling and normal traffic are never throttled.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

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
    """GET/PATCH /auth/me — current user; seeds the csrftoken cookie for the SPA.

    ``PATCH`` is the trainee's self-service trainer link/unlink (P7 §5.3b):
    ``{trainer_id: <id>|null}`` sets/clears **their own** ``head_trainer`` (null =
    back to self-tracking). Trainee-only + self-only — the target is always
    ``request.user``, never a ``?user=`` id, so no ``can_access`` is needed.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response(UserSerializer(request.user).data)

    def patch(self, request: Request) -> Response:
        if request.user.role != Role.TRAINEE:
            # Only trainees have a head trainer; trainers self-track by definition.
            return Response(
                {"detail": "not_a_trainee"},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = LinkTrainerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
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
    :class:`GoalAccessPermission` (epic §3). ``list`` + ``create`` are P6;
    ``partial_update`` (toggle-complete) is P7 — the owner trainee *or* the trainer
    who owns the trainee flips ``is_completed`` (the permission already admits it).
    """

    serializer_class = GoalSerializer
    permission_classes = [IsAuthenticated, GoalAccessPermission]
    parser_classes = [JSONParser]

    def get_serializer_class(self):
        # Toggle-complete writes only ``is_completed`` (P7); everything else uses
        # the full goal shape.
        if self.action == "partial_update":
            return GoalToggleSerializer
        return GoalSerializer

    def get_queryset(self) -> QuerySet[Goal]:
        user = self.request.user
        if self.action == "list":
            # Permission already asserted can_access(target); filter to it.
            target = self.get_target_user(self.request)
            return Goal.objects.filter(user=target).select_related("user")

        # Detail actions (P7 PATCH): scope to rows this caller may reach so a
        # trainer can toggle their own trainee's goal and an inaccessible id 404s
        # (no existence leak, epic Q6). Mirrors MeasurementViewSet. The scoping
        # rule lives on the model beside can_access — not re-encoded here (§10).
        return Goal.objects.filter(
            user.accessible_data_filter("user")
        ).select_related("user")

    def perform_create(self, serializer: GoalSerializer) -> None:
        # Owner is forced to the caller — any ``user`` in the body is ignored.
        serializer.save(user=self.request.user)


class TraineeViewSet(viewsets.ReadOnlyModelViewSet):
    """Trainer roster read API (P7 §5.1): list own trainees + one trainee summary.

    Trainer-only (:class:`TraineeRosterPermission`); every row is one of the
    caller's own trainees, annotated with at-a-glance weight progress by the
    roster service. Read-only — there is no account create/edit/delete: onboarding
    is self-registration and a trainee links a trainer themselves (§5.3). A
    non-owned id 404s because the queryset is limited to the caller's trainees (no
    existence leak, epic Q6); ``can_access`` gates the object for defense-in-depth.
    """

    serializer_class = RosterEntrySerializer
    permission_classes = [IsAuthenticated, TraineeRosterPermission]
    parser_classes = [JSONParser]

    def get_queryset(self) -> QuerySet[CustomUser]:
        return roster.roster_queryset(self.request.user)


class MessagesView(APIView):
    """GET/POST /messages — the chat thread + send (P8 §5.4, AC-1/AC-3/AC-4).

    * **GET ?with=:userId&since=:ts** — the 1:1 thread between the caller and
      ``:userId``, ordered ascending. ``since`` returns only strictly-newer
      messages (incremental poll — never re-fetch the whole thread); absent, it
      returns the last 200 chronologically (§11 Q9). A non-reachable thread 404s
      (no existence leak, §11 Q1).
    * **POST {to, content}** — send. ``sender`` is forced to the caller; the
      recipient relationship is gated by :class:`MessageAccessPermission` (403 for
      a stranger). Thin: the serializer validates + creates.
    """

    permission_classes = [MessageAccessPermission]

    def get_other_user(self, request: Request) -> CustomUser | None:
        """Resolve the counterpart the permission gates on (``to`` for POST)."""
        raw = request.data.get("to")
        if raw is None:
            return None
        return CustomUser.objects.filter(pk=raw).first()

    def get(self, request: Request) -> Response:
        with_id = request.query_params.get("with")
        if with_id is None:
            return Response(
                {"detail": "missing_with"}, status=status.HTTP_400_BAD_REQUEST
            )
        other = get_object_or_404(CustomUser, pk=with_id)
        if not request.user.can_communicate_with(other):
            # No existence leak: an unreachable thread is simply not found (Q1).
            raise Http404

        base = Message.objects.filter(
            Q(sender=request.user, receiver=other)
            | Q(sender=other, receiver=request.user)
        ).select_related("sender", "receiver")

        since = request.query_params.get("since")
        if since:
            parsed = parse_datetime(since)
            if parsed is None:
                return Response(
                    {"detail": "invalid_since"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            messages = base.filter(created_at__gt=parsed).order_by("created_at")
        else:
            # Q9: last 200 on first load, returned chronologically.
            recent = list(base.order_by("-created_at")[:200])
            recent.reverse()
            messages = recent

        data = MessageSerializer(
            messages, many=True, context={"request": request}
        ).data
        return Response(data)

    def post(self, request: Request) -> Response:
        serializer = MessageCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        message = serializer.save()
        return Response(
            MessageSerializer(message, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class MessageReadView(APIView):
    """POST /messages/read {with} — mark the thread read once (P8 §5.4, AC-1).

    Sets ``read_at`` on the caller's unread received messages from ``:with``.
    Idempotent — a second call updates nothing (mark-read *once*, not per poll).
    Relationship-gated by :class:`MessageAccessPermission` (403 for a stranger).
    """

    permission_classes = [MessageAccessPermission]

    def get_other_user(self, request: Request) -> CustomUser | None:
        raw = request.data.get("with")
        if raw is None:
            return None
        return CustomUser.objects.filter(pk=raw).first()

    def post(self, request: Request) -> Response:
        other = self.get_other_user(request)
        if other is None:
            return Response(
                {"detail": "unknown_recipient"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        updated = Message.objects.filter(
            sender=other, receiver=request.user, read_at__isnull=True
        ).update(read_at=timezone.now())
        return Response({"updated": updated})


class MeExportView(APIView):
    """GET /me/export — the caller's own data as one JSON document (P8 §5.6, AC-9).

    Self-only (no ``?user=``, no ``can_access`` — you can only export yourself).
    Photos are Blob **URLs**, not bytes. Any role may export its own data.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        user = request.user
        measurements = Measurement.objects.filter(user=user).order_by("created_at")
        goals = Goal.objects.filter(user=user).order_by("created_at")
        messages = (
            Message.objects.filter(Q(sender=user) | Q(receiver=user))
            .select_related("sender", "receiver")
            .order_by("created_at")
        )
        return Response(
            {
                "profile": UserSerializer(user).data,
                "measurements": MeasurementSerializer(measurements, many=True).data,
                "goals": GoalSerializer(goals, many=True).data,
                "messages": MessageSerializer(
                    messages, many=True, context={"request": request}
                ).data,
            }
        )


class AccountDeleteView(APIView):
    """DELETE /me — self-service account deletion (P8 §5.6, AC-8/AC-9).

    Destructive + irreversible. Self-only. Deleting the ``CustomUser`` cascades
    (``on_delete=CASCADE``) to their measurements, goals and messages; the
    measurement ``post_delete`` blob-cleanup signal (P3) fires on that cascade, so
    photo blobs are removed with no orphan — no manual blob loop needed here. A
    trainer's trainees are **not** deleted: ``head_trainer`` is ``SET_NULL``, so
    they fall back to self-tracking.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request: Request) -> Response:
        user = request.user
        logout(request)  # clear the session before the row disappears.
        user.delete()  # cascade drops measurements/goals/messages; signal cleans blobs.
        return Response(status=status.HTTP_204_NO_CONTENT)
