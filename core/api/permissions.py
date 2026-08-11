"""DRF permission classes — the only consumers of ``can_access``.

No class here makes an ``if role ==`` data-access decision; each delegates to
``request.user.can_access(target)`` (epic §3). Role *gating* (e.g. "create is
trainee-only") is a separate, explicit concern for the endpoint that needs it
(P2+), not baked in here.
"""
from __future__ import annotations

from typing import Protocol

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from core.models import CustomUser


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
