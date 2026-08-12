"""The Measurement model — the data spine of the core loop (P2).

A trainee logs body numbers; a trainer reviews them. This module owns the
numeric fields, the unit system, and the absolute floor/ceiling validators that
kill garbage data (``5000 kg``; rebuild-analysis.md §2 #8).

Shared model across the measurements epic:

* P2 — numeric fields, ``unit_system``, range validators, timestamps.
* P3 (this) — progress-photo URL fields (full + thumbnail). Bytes live in Vercel
  Blob, not the DB; the model holds only the resulting public URLs. Upload +
  thumbnail happen at the serializer boundary; blob delete-on-delete is a
  ``post_delete`` signal (``core/services/blob_cleanup.py``), not a ``save()``
  override, so cascade deletes clean up too.
* P4 (this) — the computed ``bmi`` property (no DB column — BMI derives from
  ``weight`` + ``height``) and the derived/chart surface. The formula lives in
  ``core/services/metrics.py``; the property is a thin adaptor so the math is not
  duplicated on the model.

Each plan must leave the model open for the next without a rewrite.
"""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from core.services import metrics


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

    # Progress photo (P3). Vercel Blob public URLs — full image + generated
    # thumbnail — set together at the serializer boundary. Empty string means "no
    # photo" (keeps the ``exclude(photo_url="")`` feed filter simple and avoids
    # nullable-URL ambiguity). No ImageField/FileField: the bytes live in Blob,
    # not a Django storage round-trip; the delete API takes the URL directly, so
    # the two URLs are sufficient for both serving and cleanup (§5.1).
    photo_url = models.URLField(max_length=500, blank=True, default="")
    thumbnail_url = models.URLField(max_length=500, blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # The per-trainee list/feed read is filter(user=...) ordered by
            # -created_at; the composite index keeps it index-backed as histories
            # grow (P8 §5.5, AC-7). `user` FK alone doesn't cover the ordering.
            models.Index(fields=["user", "-created_at"]),
        ]

    @property
    def bmi(self) -> Decimal | None:
        """Computed BMI for this row (P4) — ``None`` if weight or height is
        missing. Delegates to :func:`core.services.metrics.bmi` (metric-only, 1
        dp); no DB column, computed on read (plan §5.1).
        """
        return metrics.bmi(self.weight, self.height)

    def __str__(self) -> str:
        return f"{self.user} @ {self.created_at:%Y-%m-%d}"
