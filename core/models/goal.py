"""The Goal model — a trainee's declarative, measurable target (P6).

A trainee sets a target for one body metric (e.g. "waist down to 85 cm"); the
trainer reviews and, later, marks it complete (toggle-complete is P7). MVP goals
are *declarative*: metric + target + direction + optional deadline + note. No
auto-progress against live measurements — that reads these values but is post-MVP
(epic §9 P6 "beyond basic add").

Scope split (epic §4, §9):

* P6 (this) — the model, and the list/create API (trainee adds own).
* P7 — the ``is_completed`` toggle via ``PATCH /api/v1/goals/:id`` (trainer or
  owner). The field ships here; the route is P7's.
"""
from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class GoalMetric(models.TextChoices):
    """Which body metric a goal targets.

    A subset of the measurement value fields: ``height`` (not a training target)
    and the derived ``bmi`` (not directly settable) are excluded (epic §11 Q6).
    """

    WEIGHT = "weight", "Weight"
    CHEST = "chest", "Chest"
    WAIST = "waist", "Waist"
    HIPS = "hips", "Hips"
    BICEPS = "biceps", "Biceps"
    THIGH = "thigh", "Thigh"
    CALF = "calf", "Calf"
    BODY_FAT_PCT = "body_fat_pct", "Body fat %"


class GoalDirection(models.TextChoices):
    """Which way the metric should move to reach the target."""

    DECREASE = "decrease", "Decrease"
    INCREASE = "increase", "Increase"


class Goal(models.Model):
    """One trainee's target for a single metric (P6 scope)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="goals",
    )
    metric = models.CharField(max_length=16, choices=GoalMetric.choices)
    target_value = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(1000)],
    )
    direction = models.CharField(max_length=8, choices=GoalDirection.choices)
    target_date = models.DateField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Open goals first, newest-first within each group.
        ordering = ["is_completed", "-created_at"]

    def __str__(self) -> str:
        return f"{self.user_id}: {self.direction} {self.metric} -> {self.target_value}"
