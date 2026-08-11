"""Derived-metrics service (P4) — BMI, deltas, and trend direction.

Pure, model-free functions over ``Decimal`` values so they are reusable by the
model ``bmi`` property, the chart-data assembler, and the future Goals
auto-progress. No Django imports beyond ``decimal``; no role/permission logic —
the caller hands in already-scoped values (epic §3, §10).

The app is **metric-only** (developer decision 2026-08-11): BMI is
``weight_kg / (height_cm/100)²`` with no imperial branch. ``unit_system`` still
exists on the model, but imperial is not a supported product path (plan §8).
"""
from __future__ import annotations

from decimal import Decimal
from typing import Final, Literal

# Quantizers: BMI and body-fat carry 1 dp; body metrics (weight/circumferences)
# carry 2 dp — matching each field's natural precision so a delta never invents
# resolution the reading didn't have.
_BMI_QUANT: Final[Decimal] = Decimal("0.1")
_BODY_QUANT: Final[Decimal] = Decimal("0.01")

# Per-family "flat" epsilons (plan §11 Q3): a change with magnitude at or below
# the epsilon reads as no real movement, so ``trend`` reports ``"flat"`` rather
# than chasing measurement noise.
FLAT_EPSILON: Final[dict[str, Decimal]] = {
    "weight": Decimal("0.1"),
    "height": Decimal("0.5"),
    "chest": Decimal("0.5"),
    "waist": Decimal("0.5"),
    "hips": Decimal("0.5"),
    "biceps": Decimal("0.5"),
    "thigh": Decimal("0.5"),
    "calf": Decimal("0.5"),
    "body_fat_pct": Decimal("0.1"),
    "bmi": Decimal("0.1"),
}
# Fallback epsilon for a metric family not listed above.
DEFAULT_FLAT_EPSILON: Final[Decimal] = Decimal("0.1")

TrendDirection = Literal["up", "down", "flat"]


def bmi(weight: Decimal | None, height: Decimal | None) -> Decimal | None:
    """Metric BMI ``weight_kg / (height_cm/100)²``, rounded to 1 dp.

    Returns ``None`` when either input is missing or height is zero (a metric row
    may carry neither weight nor height). Metric-only — no unit parameter.
    """
    if weight is None or height is None or height == 0:
        return None
    height_m = height / Decimal("100")
    return (weight / (height_m * height_m)).quantize(_BMI_QUANT)


def delta(
    latest: Decimal | None,
    previous: Decimal | None,
    *,
    quant: Decimal = _BODY_QUANT,
) -> Decimal | None:
    """Signed change ``latest - previous`` (most-recent movement; plan §11 Q2).

    ``None`` if either reading is missing. Rounded to ``quant`` (2 dp for body
    metrics, 1 dp for BMI/body-fat — pass ``quant`` accordingly).
    """
    if latest is None or previous is None:
        return None
    return (latest - previous).quantize(quant)


def trend(
    change: Decimal | None,
    *,
    flat_epsilon: Decimal,
) -> TrendDirection | None:
    """Direction of a signed delta as a stable key (epic Q6): ``"up"`` /
    ``"down"`` / ``"flat"``; ``None`` when ``change`` is ``None``.

    Direction is **neutral** — it reports the sign of change, not whether that
    change is "good" (goodness depends on the metric + the trainee's goal, a
    Goals concern in P6/P7). ``"flat"`` when ``abs(change) <= flat_epsilon``.
    """
    if change is None:
        return None
    if abs(change) <= flat_epsilon:
        return "flat"
    return "up" if change > 0 else "down"


# body-fat estimate: post-MVP (plan §3; epic §9 P4 note). A future
# ``body_fat(...)`` derivation slots in here beside ``bmi`` without a rewrite —
# ``chart_data`` charts the stored ``body_fat_pct`` input as-is until then.
