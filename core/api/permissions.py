"""DRF permission classes — the only consumers of ``can_access``.

No class here makes an ``if role ==`` data-access decision; each delegates to
``request.user.can_access(target)`` (epic §3). Role *gating* (e.g. "create is
trainee-only") is a separate, explicit concern for the endpoint that needs it
(P2+), not baked in here.
"""
from __future__ import annotations

from typing import Protocol

from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from core.models import CustomUser, Role


class _HasTargetUser(Protocol):
    """A view that can resolve the target user for a request."""

    def get_target_user(self, request: Request) -> CustomUser: ...


class CanAccessTarget(BasePermission):
    """Grant access iff ``request.user.can_access(target)`` for the view's target.

    The view must expose ``get_target_user(request) -> CustomUser`` naming the
    user whose data is being touched. This is the contract P2+ viewsets consume;
    it lives here so the single access authority stays in one file from day one
    (epic §3). In P1 no domain object exists yet, so no view wires it — it is
    exercised by hand once P2 adds a target.
    """

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        resolver = getattr(view, "get_target_user", None)
        if resolver is None:
            return False
        target = resolver(request)
        return user.can_access(target)


class IsTrainee(BasePermission):
    """Explicit role gating: caller must be a trainee.

    This is endpoint gating (who may hit the verb), not a data-access decision,
    so it lives as its own class rather than folded into ``can_access`` (epic §3,
    P1 permissions docstring).
    """

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(
            user and user.is_authenticated and user.role == Role.TRAINEE
        )


class TraineeRosterPermission(BasePermission):
    """Access gate for the trainer roster (P7 §5.1).

    Endpoint gating: the roster (``GET /trainees[/:id]``) is **trainer-only** — a
    trainee gets 403. Object access still delegates to ``can_access`` for
    defense-in-depth, though the viewset queryset already limits rows to the
    caller's own trainees (a non-owned id 404s, no existence leak — epic Q6). The
    trainer->trainee rule itself is never re-encoded here (epic §3).
    """

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(
            user and user.is_authenticated and user.role == Role.TRAINER
        )

    def has_object_permission(
        self, request: Request, view: APIView, obj: object
    ) -> bool:
        return request.user.can_access(obj)


class MeasurementAccessPermission(BasePermission):
    """Access gate for measurements — all reads delegate to ``can_access``.

    It never re-implements the trainer->trainee rule (that lives solely in
    ``can_access``). It only adds the two endpoint concerns the routes require
    (mvp-routes.md §C):

    * **create** is trainee-only and always for ``self`` (owner forced in the
      view); role gating reuses :class:`IsTrainee`.
    * **edit/delete** are owner-trainee only — a trainer who may *read* a
      trainee's row still cannot mutate it.
    """

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if request.method == "POST":
            # Create: trainee-only, and the target must be self.
            if not IsTrainee().has_permission(request, view):
                return False
            target = view.get_target_user(request)
            return target.pk == user.pk and user.can_access(target)

        # list + collection dispatch: gate the resolved target. Detail rows are
        # further gated by has_object_permission below.
        resolver = getattr(view, "get_target_user", None)
        if resolver is None:
            return False
        target = resolver(request)
        return user.can_access(target)

    def has_object_permission(
        self, request: Request, view: APIView, obj: object
    ) -> bool:
        user = request.user
        if request.method in SAFE_METHODS:
            return user.can_access(obj.user)
        # PATCH/DELETE: owner-trainee only.
        return obj.user_id == user.pk and user.role == Role.TRAINEE


class GoalAccessPermission(BasePermission):
    """Access gate for goals — all reads delegate to ``can_access`` (P6).

    Shaped like :class:`MeasurementAccessPermission`, with the endpoint concerns
    the goal routes require (mvp-routes.md §C):

    * **create** is trainee-only and always for ``self`` (owner forced in the
      view); role gating reuses :class:`IsTrainee`.
    * **toggle-complete** (``PATCH``, wired in P7) is allowed for the owner
      trainee *or* the trainer who owns the trainee — so P7 adds only the route,
      not new permission logic. Read stays gated by ``can_access``.
    """

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if request.method == "POST":
            if not IsTrainee().has_permission(request, view):
                return False
            target = view.get_target_user(request)
            return target.pk == user.pk and user.can_access(target)

        resolver = getattr(view, "get_target_user", None)
        if resolver is None:
            return False
        target = resolver(request)
        return user.can_access(target)

    def has_object_permission(
        self, request: Request, view: APIView, obj: object
    ) -> bool:
        user = request.user
        if request.method in SAFE_METHODS:
            return user.can_access(obj.user)
        # PATCH (toggle-complete, P7): owner trainee, or trainer who owns them.
        # ``can_access`` already encodes trainer->trainee ownership.
        return obj.user_id == user.pk or (
            user.role == Role.TRAINER and user.can_access(obj.user)
        )


class MessageAccessPermission(BasePermission):
    """Chat gate — both parties in an allowed relationship (P8 §5.3, mvp-routes §C).

    Uses the **symmetric** ``can_communicate_with`` (built on the single
    ``can_access`` predicate): a trainee may chat their own trainer even though
    ``can_access`` is directional. The relationship rule is never re-encoded here.

    Endpoint concerns:

    * **POST** (send / mark-read): resolve the counterpart via the view's
      ``get_other_user`` and require the relationship — a stranger recipient is
      **403**.
    * **GET** (thread): authentication only here; the view resolves the
      counterpart and **404s** a non-reachable thread (no existence leak, epic Q6),
      matching the measurement/goal detail pattern (§11 Q1).
    """

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method == "POST":
            other = view.get_other_user(request)
            return bool(other and user.can_communicate_with(other))
        return True
