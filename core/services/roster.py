"""Roster-aggregation service (P7 §5.1) — a trainer's trainees + weight progress.

The one P7 endpoint that fans out over many rows, so the queryset is annotated
(last-measured date, entry count) and prefetches each trainee's history once —
no N+1 (epic §7 perf). Weight ``delta``/``trend`` reuse the P4 metrics service so
the up/down/flat rule is never re-implemented (epic §3, §10). User-agnostic: it
receives the trainer and returns their own trainees only; access is still gated
by ``can_access`` in the permission layer.
"""
from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING, Final, Iterable

from django.db.models import Count, F, Max, Prefetch, QuerySet

from core.models import Measurement
from core.services import metrics

if TYPE_CHECKING:
    from core.models import CustomUser

# Weight readings carry 2 dp; a delta rounds to the same so it never invents
# resolution the reading didn't have (mirrors chart_data's body default).
_WEIGHT_QUANT: Final[Decimal] = Decimal("0.01")


def roster_queryset(trainer: "CustomUser") -> QuerySet:
    """The trainer's trainees, annotated + prefetched for the roster serializer.

    One query for the rows (with ``last_measured_at`` / ``measurement_count``
    annotations) plus one prefetch of each trainee's measurements newest-first, so
    :func:`weight_summary` reads the two latest weights from memory. Ordered
    most-recently-active first, nulls (never-logged) last (§11 Q3).
    """
    return (
        trainer.trainees.annotate(
            last_measured_at=Max("measurements__measured_at"),
            measurement_count=Count("measurements"),
        )
        .prefetch_related(
            Prefetch(
                "measurements",
                queryset=Measurement.objects.order_by("-created_at"),
            )
        )
        .order_by(F("last_measured_at").desc(nulls_last=True), "username")
    )


def weight_summary(measurements: Iterable[Measurement]) -> dict:
    """``{latest_value, delta, trend}`` for weight over the two most recent entries.

    ``measurements`` must be newest-first (as :func:`roster_queryset` prefetches).
    Skips null weights, so the "latest"/"previous" are the two most recent *actual*
    weight readings. Values are JSON numbers (or ``None``); ``trend`` is a stable
    ``"up"|"down"|"flat"|None`` key. Delegates the movement rule to the metrics
    service.
    """
    weights = [m.weight for m in measurements if m.weight is not None]
    latest = weights[0] if weights else None
    previous = weights[1] if len(weights) > 1 else None
    change = metrics.delta(latest, previous, quant=_WEIGHT_QUANT)
    return {
        "latest_value": None if latest is None else float(latest),
        "delta": None if change is None else float(change),
        "trend": metrics.trend(
            change, flat_epsilon=metrics.FLAT_EPSILON["weight"]
        ),
    }
