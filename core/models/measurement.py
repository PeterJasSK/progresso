"""The Measurement model — the data spine of the core loop (P2).

A trainee logs body numbers; a trainer reviews them. This module owns the
numeric fields, the unit system, and the absolute floor/ceiling validators that
kill garbage data (``5000 kg``; rebuild-analysis.md §2 #8).

Shared model across the measurements epic:

* P2 (this) — numeric fields, ``unit_system``, range validators, timestamps.
* P3 — photo bytes + thumbnail fields + a save hook + blob delete-on-delete.
* P4 — the ``bmi`` property and the derived/chart surface.

P2 must leave the model open for those additions without a rewrite: no photo
field, no ``bmi`` property here.
"""
from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class UnitSystem(models.TextChoices):
    """Per-row unit system. Values are stored as entered (no normalization)."""

    METRIC = "metric", "Metric"
    IMPERIAL = "imperial", "Imperial"


# Absolute model-level floor/ceiling: wide enough to admit both unit systems but
# tight enough that nonsense can never reach the DB, even via Django admin. The
# tight, unit-aware bands live in the serializer (MeasurementSerializer.validate).
_CIRCUMFERENCE_VALIDATORS = [MinValueValidator(0), MaxValueValidator(400)]


class Measurement(models.Model):
    """One dated set of a trainee's body numbers (P2 scope)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="measurements",
    )
    unit_system = models.CharField(
        max_length=8,
        choices=UnitSystem.choices,
        default=UnitSystem.METRIC,
    )

    weight = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(1000)],
    )
    height = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(300)],
    )
    chest = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=_CIRCUMFERENCE_VALIDATORS,
    )
    waist = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=_CIRCUMFERENCE_VALIDATORS,
    )
    hips = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=_CIRCUMFERENCE_VALIDATORS,
    )
    biceps = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=_CIRCUMFERENCE_VALIDATORS,
    )
    thigh = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=_CIRCUMFERENCE_VALIDATORS,
    )
    calf = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=_CIRCUMFERENCE_VALIDATORS,
    )
    body_fat_pct = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(75)],
    )

    # measured_at: the entry's real-world date (editable, defaults to today);
    # P4 charts plot on this. created_at: immutable server insert time.
    measured_at = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user} @ {self.created_at:%Y-%m-%d}"
