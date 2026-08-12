"""The custom user model and the single authorization predicate.

`CustomUser.can_access` is the *one* source of access truth for the whole app
(epic §3). Every DRF permission class consumes it; no inline ``if role`` access
decision may live anywhere else.
"""
from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q


class Role(models.TextChoices):
    """User roles. HELPER is shape-only in MVP (no live grant — epic Q3)."""

    TRAINEE = "trainee", "Trainee"
    TRAINER = "trainer", "Trainer"
    ADMIN = "admin", "Admin"
    HELPER = "helper", "Helper"


class CustomUser(AbstractUser):
    """Trainer/trainee user carrying the relationship graph and `can_access`."""

    role = models.CharField(
        max_length=16,
        choices=Role.choices,
        default=Role.TRAINEE,
    )
    # A trainee points at its head trainer; a trainer's roster is `self.trainees`.
    head_trainer = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="trainees",
    )
    # Shaped for post-MVP helper access; not consulted by any MVP grant (epic Q3).
    helpers = models.ManyToManyField(
        "self",
        symmetrical=False,
        blank=True,
        related_name="assisting_for",
    )

    def can_access(self, target: "CustomUser") -> bool:
        """Return whether this user may access ``target``'s data.

        The single access predicate (epic §3). Cheap, read-only, no DB writes.
        MVP rules (epic §5 / mvp-routes.md §C):

        * admin (role admin or ``is_superuser``) -> anyone
        * any user -> self
        * trainer -> a trainee whose ``head_trainer`` is this trainer
        * trainee -> only self (falls through to False)

        The helper branch is intentionally deferred (post-MVP): the ``helpers``
        relation exists so this predicate can grow into it without a migration,
        but it grants nothing today.
        """
        if self.is_superuser or self.role == Role.ADMIN:
            return True
        if self.pk == target.pk:
            return True
        if self.role == Role.TRAINER:
            return target.head_trainer_id == self.pk
        # HELPER branch deferred (post-MVP); trainee and everything else: no access.
        return False

    def can_communicate_with(self, other: "CustomUser") -> bool:
        """Return whether this user and ``other`` may chat (P8 §5.3).

        Chat requires *both parties in an allowed trainer<->trainee relationship*
        (mvp-routes.md §C). ``can_access`` is directional — a trainer can access
        their trainee but ``trainee.can_access(trainer)`` is ``False`` — so the
        chat gate is the **symmetric OR** of the single predicate. This keeps the
        relationship rule expressed once (built on ``can_access``); admins and
        self-pairs fall out naturally. No new relationship logic (epic §3).
        """
        return self.can_access(other) or other.can_access(self)

    def accessible_data_filter(self, field: str = "user") -> Q:
        """Return a ``Q`` selecting rows on ``field`` this user may read.

        The queryset-scoping mirror of :meth:`can_access` — kept here beside the
        single access predicate so the trainer->trainee relationship is never
        re-encoded in a view (epic §3, §10). Consumers use it to scope detail
        querysets so an inaccessible id 404s instead of leaking existence
        (epic Q6). Same MVP rules as :meth:`can_access`.
        """
        if self.is_superuser or self.role == Role.ADMIN:
            return Q()  # all rows
        if self.role == Role.TRAINER:
            return Q(**{field: self}) | Q(**{f"{field}__head_trainer": self})
        return Q(**{field: self})
