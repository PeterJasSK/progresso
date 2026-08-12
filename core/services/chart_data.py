"""Chart-data service (P4) — server-computed Chart.js series.

Turns one trainee's ascending measurement history into the derived surface the
progress screens render (P6/P7): a shared date axis, per-metric value arrays
(null-gapped), a computed BMI array, and a per-metric ``{latest, delta, trend}``
summary for the stat tiles (plan §5.3–5.4; ``design-system.md`` §5).

User-agnostic: it receives an already-scoped queryset and never looks at roles,
so no permission rule can drift here (epic §10). Values serialize as JSON
*numbers* — cast to ``float`` because the project leaves DRF's
``COERCE_DECIMAL_TO_STRING`` at its ``True`` default (plan §8, §11 Q6), and
Chart.js plots numbers without client-side parsing.
"""
from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING, Final, Iterable

from core.services import metrics

if TYPE_CHECKING:
    from core.models import Measurement

# The charted body-metric fields (P2's value fields). BMI is appended as a
# computed series, not a stored field. Kept local — the model has no canonical
# list and a service must not import from the api layer (exploration note #4).
_VALUE_FIELDS: Final[tuple[str, ...]] = (
    "weight",
    "chest",
    "waist",
    "hips",
    "biceps",
    "thigh",
    "calf",
    "body_fat_pct",
)

# Metrics whose delta rounds to 1 dp (their fields carry 1 dp); everything else
# rounds to the 2-dp body default in ``metrics.delta``.
_ONE_DP_METRICS: Final[frozenset[str]] = frozenset({"body_fat_pct", "bmi"})


def _num(value: Decimal | None) -> float | None:
    """JSON number for the payload (or ``None``) — see module docstring."""
    return None if value is None else float(value)


def _summary_for(values: list[Decimal | None], metric: str) -> dict:
    """``{latest, delta, trend}`` over the last two *non-null* readings.

    Delta needs two readings; a metric with one reading gets
    ``delta: null, trend: null``. Trend uses the metric's flat epsilon.
    """
    present = [v for v in values if v is not None]
    if not present:
        return {"latest": None, "delta": None, "trend": None}

    latest = present[-1]
    previous = present[-2] if len(present) >= 2 else None
    quant = Decimal("0.1") if metric in _ONE_DP_METRICS else Decimal("0.01")
    change = metrics.delta(latest, previous, quant=quant)
    epsilon = metrics.FLAT_EPSILON.get(metric, metrics.DEFAULT_FLAT_EPSILON)
    return {
        "latest": _num(latest),
        "delta": _num(change),
        "trend": metrics.trend(change, flat_epsilon=epsilon),
    }


def build_series(measurements: Iterable[Measurement]) -> dict:
    """Assemble the Chart.js-ready series for one user's history.

    ``measurements`` must be **ascending by ``measured_at``** (oldest first —
    charts read left-to-right; the list endpoint stays newest-first, they differ
    intentionally). Returns the plan §5.4 dict: ``dates`` axis, per-metric arrays
    index-aligned to ``dates`` (``null`` for gaps), a ``bmi`` array, and a
    ``summary`` map. Empty history → a valid empty series (not a 404).
    """
    rows = list(measurements)
    if not rows:
        return {
            "user": None,
            "unit_system": None,
            "dates": [],
            "metrics": {},
            "summary": {},
        }

    dates = [row.measured_at.isoformat() for row in rows]

    # Raw per-metric Decimal columns (kept for the summary); the payload arrays
    # are the JSON-number projection of these.
    columns: dict[str, list[Decimal | None]] = {
        field: [getattr(row, field) for row in rows] for field in _VALUE_FIELDS
    }
    # Height is a once-set profile attribute (P9): BMI uses the owner's single
    # ``height_cm`` x each row's weight. All rows share one owner (the series is
    # user-scoped); read it once. Caller passes a ``select_related("user")``
    # queryset so this touches no extra query.
    owner_height = rows[0].user.height_cm
    columns["bmi"] = [metrics.bmi(row.weight, owner_height) for row in rows]

    metric_arrays: dict[str, list[float | None]] = {}
    summary: dict[str, dict] = {}
    for metric, values in columns.items():
        # Omit a metric with no reading across the whole history — keeps the
        # payload lean (plan §5.4 / §11 Q6).
        if all(v is None for v in values):
            continue
        metric_arrays[metric] = [_num(v) for v in values]
        summary[metric] = _summary_for(values, metric)

    return {
        "user": rows[0].user_id,
        "unit_system": "metric",
        "dates": dates,
        "metrics": metric_arrays,
        "summary": summary,
    }
