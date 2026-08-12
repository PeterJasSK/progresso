"""Serializers for the auth surface.

Validation logic lives here (thin views — epic §3). All error ``detail`` values
are translation *keys*, not English prose, so the frontend localizes (epic Q6).
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from rest_framework import serializers

from core.models import (
    CustomUser,
    Goal,
    GoalDirection,
    GoalMetric,
    Measurement,
    Message,
    Role,
    UnitSystem,
)
from core.services import blob_cleanup, photos, roster


class UserSerializer(serializers.ModelSerializer):
    """Public user shape + the trainee's linked trainer (P7 §5.3b).

    ``head_trainer``/``head_trainer_name`` let the SPA show and manage a trainee's
    coach link (self-service linking); both are read-only here — linking goes
    through :class:`ProfileUpdateSerializer` on ``PATCH /auth/me``. Null for trainers
    and for unassigned (self-tracking) trainees. No password/email leak.
    """

    head_trainer_name = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = (
            "id",
            "username",
            "role",
            "head_trainer",
            "head_trainer_name",
            "height_cm",
        )
        read_only_fields = ("head_trainer", "height_cm")

    def get_head_trainer_name(self, obj: CustomUser) -> str | None:
        trainer = obj.head_trainer
        return (trainer.get_full_name() or trainer.username) if trainer else None


class ProfileUpdateSerializer(serializers.Serializer):
    """Self-service profile edit for a trainee (P7 linking + P9 height).

    Both fields are **optional** — a request may set either or both:

    * ``trainer_id`` names an existing trainer to attach, or ``null`` to unlink
      (back to self-tracking) — the P7 self-service link/unlink.
    * ``height_cm`` sets the once-set profile height (50–250), or ``null`` to
      clear it — the P9 move of height off the per-measurement capture form.

    Trainee-only + self-only — the view forces the target to ``request.user`` (no
    ``?user=``). Error ``detail`` is a translation key (epic Q6):
    ``invalid_trainer``; out-of-range height surfaces DRF's field key.
    """

    trainer_id = serializers.IntegerField(required=False, allow_null=True)
    height_cm = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=5,
        decimal_places=1,
        validators=[
            MinValueValidator(Decimal("50")),
            MaxValueValidator(Decimal("250")),
        ],
    )

    def validate_trainer_id(self, value: int | None) -> int | None:
        if value is None:
            return None
        trainer = CustomUser.objects.filter(
            pk=value, role=Role.TRAINER
        ).first()
        if trainer is None:
            raise serializers.ValidationError("invalid_trainer")
        self._trainer = trainer
        return value

    def save(self, *, user: CustomUser) -> CustomUser:
        update_fields: list[str] = []
        if "trainer_id" in self.validated_data:
            user.head_trainer = (
                None
                if self.validated_data["trainer_id"] is None
                else self._trainer
            )
            update_fields.append("head_trainer")
        if "height_cm" in self.validated_data:
            user.height_cm = self.validated_data["height_cm"]
            update_fields.append("height_cm")
        if update_fields:
            user.save(update_fields=update_fields)
        return user


class RosterEntrySerializer(serializers.ModelSerializer):
    """A trainer's roster row (P7 §5.1): the trainee + at-a-glance weight progress.

    Read-only. ``last_measured_at``/``measurement_count`` are queryset annotations
    (:func:`core.services.roster.roster_queryset`); ``latest_value``/``delta``/
    ``trend`` are the weight readout over the two most recent entries, computed by
    :func:`core.services.roster.weight_summary` from the prefetched history — no
    per-row query. ``overdue`` is client-side (§11 Q4), not here. Primary metric is
    weight (the headline metric, §11 Q2).
    """

    display_name = serializers.SerializerMethodField()
    last_measured_at = serializers.DateField(read_only=True)
    measurement_count = serializers.IntegerField(read_only=True)
    primary_metric = serializers.SerializerMethodField()
    latest_value = serializers.SerializerMethodField()
    delta = serializers.SerializerMethodField()
    trend = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = (
            "id",
            "username",
            "display_name",
            "role",
            "last_measured_at",
            "measurement_count",
            "primary_metric",
            "latest_value",
            "delta",
            "trend",
        )

    def get_display_name(self, obj: CustomUser) -> str:
        return obj.get_full_name() or obj.username

    def get_primary_metric(self, obj: CustomUser) -> str:
        return "weight"

    def _summary(self, obj: CustomUser) -> dict:
        # Compute once per row, then reuse across the three method fields.
        cached = getattr(obj, "_weight_summary", None)
        if cached is None:
            cached = roster.weight_summary(obj.measurements.all())
            obj._weight_summary = cached
        return cached

    def get_latest_value(self, obj: CustomUser) -> float | None:
        return self._summary(obj)["latest_value"]

    def get_delta(self, obj: CustomUser) -> float | None:
        return self._summary(obj)["delta"]

    def get_trend(self, obj: CustomUser) -> str | None:
        return self._summary(obj)["trend"]


class TrainerOptionSerializer(serializers.ModelSerializer):
    """Read-only ``{id, display_name}`` for the signup trainer dropdown."""

    display_name = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = ("id", "display_name")

    def get_display_name(self, obj: CustomUser) -> str:
        return obj.get_full_name() or obj.username


class RegisterSerializer(serializers.Serializer):
    """Open self-registration (§0). Trainee/trainer only; admin/helper rejected."""

    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=Role.choices)
    trainer_id = serializers.IntegerField(
        write_only=True, required=False, allow_null=True
    )

    def validate_username(self, value: str) -> str:
        if CustomUser.objects.filter(username=value).exists():
            raise serializers.ValidationError("username_taken")
        return value

    def validate_role(self, value: str) -> str:
        # Only self-service roles may be chosen at signup.
        if value not in (Role.TRAINEE, Role.TRAINER):
            raise serializers.ValidationError("invalid_role")
        return value

    def validate_password(self, value: str) -> str:
        try:
            password_validation.validate_password(value)
        except DjangoValidationError:
            # Collapse Django's messages to a single translatable key.
            raise serializers.ValidationError("password_too_weak")
        return value

    def validate(self, attrs: dict) -> dict:
        role = attrs.get("role")
        trainer_id = attrs.get("trainer_id")

        if role == Role.TRAINER:
            # Trainers have no head trainer; ignore any supplied trainer_id.
            attrs["trainer_id"] = None
            return attrs

        # role == trainee: trainer_id optional; if given it must be a trainer.
        if trainer_id is not None:
            trainer = CustomUser.objects.filter(
                pk=trainer_id, role=Role.TRAINER
            ).first()
            if trainer is None:
                raise serializers.ValidationError({"trainer_id": "invalid_trainer"})
            attrs["_trainer"] = trainer
        return attrs

    def create(self, validated_data: dict) -> CustomUser:
        trainer = validated_data.pop("_trainer", None)
        validated_data.pop("trainer_id", None)
        user = CustomUser.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            role=validated_data["role"],
        )
        if trainer is not None:
            user.head_trainer = trainer
            user.save(update_fields=["head_trainer"])
        return user


class MeasurementSerializer(serializers.ModelSerializer):
    """Measurement CRUD shape with unit-aware range validation (P2, AC-1..AC-3).

    ``user`` is read-only — ownership is never client-set; the viewset forces it
    to ``request.user`` on create (mvp-routes.md §C). All error ``detail`` values
    are translation *keys* (epic Q6): ``out_of_range``, ``no_values``,
    ``invalid_unit_system``, ``invalid_image``, ``photo_too_large``.

    Progress photo (P3): ``photo`` is a write-only upload; ``photo_url`` and
    ``thumbnail_url`` are read-only Blob public URLs carried in every payload
    (AC-6). The upload is validated + thumbnailed + pushed to Blob by
    :mod:`core.services.photos` on create/update — the view stays thin (§5.4).
    """

    # Plain CharField (not ChoiceField) so a bad/blank choice routes through our
    # own translatable key instead of DRF's default English "not a valid choice".
    unit_system = serializers.CharField(required=False)

    # Write-only upload. DRF's ImageField already rejects non-images under the
    # ``invalid_image`` key; the override maps that key to a bare translation key
    # (epic Q6) instead of DRF's English prose. ``photos.process_upload`` is the
    # authoritative validator (size cap + normalize + thumbnail).
    photo = serializers.ImageField(
        write_only=True,
        required=False,
        allow_null=True,
        error_messages={"invalid_image": "invalid_image"},
    )

    # Computed BMI (P4) riding in every single-measurement payload (list/detail)
    # for the P6/P7 stat tiles. Read-only; ``None`` when weight or height is
    # absent. A method field so it maps straight to the model property and
    # serializes as a JSON number, not the string DRF coerces DecimalFields into
    # (plan §5.7, §11 Q6). The ``series`` endpoint does not use this serializer.
    bmi = serializers.SerializerMethodField()

    class Meta:
        model = Measurement
        fields = (
            "id",
            "user",
            "unit_system",
            "weight",
            "chest",
            "waist",
            "hips",
            "biceps",
            "thigh",
            "calf",
            "body_fat_pct",
            "measured_at",
            "created_at",
            "bmi",
            "photo",
            "photo_url",
            "thumbnail_url",
        )
        read_only_fields = (
            "user",
            "created_at",
            "bmi",
            "photo_url",
            "thumbnail_url",
        )

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        # Drop the model's absolute min/max validators from the API fields so the
        # unit-aware band in validate() is the single range authority here and
        # every out-of-range value returns the translatable ``out_of_range`` key
        # (epic Q6) — not DRF's English "Ensure this value is..." prose. The
        # model validators still guard the DB/admin floor (§5.2).
        for name in self._VALUE_FIELDS:
            field = self.fields[name]
            field.validators = [
                v
                for v in field.validators
                if not isinstance(v, (MinValueValidator, MaxValueValidator))
            ]

    # The body-metric value fields. "At least one present" is enforced so an
    # all-null entry (meaningless) is rejected on create.
    # Height left the capture surface in P9 (once-set profile attribute); it is no
    # longer a writable/serialized measurement field (still a DB column, deprecated).
    _VALUE_FIELDS = (
        "weight",
        "chest",
        "waist",
        "hips",
        "biceps",
        "thigh",
        "calf",
        "body_fat_pct",
    )

    # Tight, unit-aware bands (§5.2). (metric_lo, metric_hi, imperial_lo, imperial_hi).
    _BANDS = {
        "weight": (20, 400, 44, 880),
        "chest": (10, 250, 4, 100),
        "waist": (10, 250, 4, 100),
        "hips": (10, 250, 4, 100),
        "biceps": (10, 250, 4, 100),
        "thigh": (10, 250, 4, 100),
        "calf": (10, 250, 4, 100),
        "body_fat_pct": (0, 75, 0, 75),
    }

    def get_bmi(self, obj: Measurement) -> float | None:
        """Serialize the model's computed BMI as a JSON number (§5.7)."""
        value = obj.bmi
        return None if value is None else float(value)

    def validate(self, attrs: dict) -> dict:
        creating = self.instance is None

        # Resolve the effective unit system: required explicitly on create
        # (epic Q2), may be omitted on PATCH (falls back to the stored value).
        unit = attrs.get("unit_system")
        if unit is None and not creating:
            unit = self.instance.unit_system
        if creating and not unit:
            raise serializers.ValidationError(
                {"unit_system": "invalid_unit_system"}
            )
        if unit is not None and unit not in UnitSystem.values:
            raise serializers.ValidationError(
                {"unit_system": "invalid_unit_system"}
            )

        # Unit-aware range check on every supplied value field.
        errors: dict[str, str] = {}
        for field in self._VALUE_FIELDS:
            value = attrs.get(field)
            if value is None:
                continue
            metric_lo, metric_hi, imperial_lo, imperial_hi = self._BANDS[field]
            if unit == UnitSystem.IMPERIAL:
                low, high = imperial_lo, imperial_hi
            else:
                low, high = metric_lo, metric_hi
            if value < low or value > high:
                errors[field] = "out_of_range"
        if errors:
            raise serializers.ValidationError(errors)

        # At least one value must be present. On create: look at attrs only.
        # On PATCH: merge over the stored instance so clearing everything fails.
        if any(
            self._resolved_value(attrs, field, creating) is not None
            for field in self._VALUE_FIELDS
        ):
            return attrs
        raise serializers.ValidationError("no_values")

    def _resolved_value(self, attrs: dict, field: str, creating: bool):
        if field in attrs:
            return attrs[field]
        if creating:
            return None
        return getattr(self.instance, field)

    def _process_photo(self, photo) -> tuple[str, str]:
        """Upload via the photos service, mapping errors to i18n keys (§5.4)."""
        owner_id = self.context["request"].user.pk
        try:
            return photos.process_upload(photo, owner_id=owner_id)
        except photos.PhotoTooLarge:
            raise serializers.ValidationError({"photo": "photo_too_large"})
        except photos.InvalidImage:
            raise serializers.ValidationError({"photo": "invalid_image"})

    def create(self, validated_data: dict) -> Measurement:
        photo = validated_data.pop("photo", None)
        if photo is not None:
            photo_url, thumbnail_url = self._process_photo(photo)
            validated_data["photo_url"] = photo_url
            validated_data["thumbnail_url"] = thumbnail_url
        return super().create(validated_data)

    def update(self, instance: Measurement, validated_data: dict) -> Measurement:
        photo = validated_data.pop("photo", None)
        # A PATCH without a photo leaves the existing one untouched (numbers-only
        # edit still works — P2 behaviour preserved).
        if photo is None:
            return super().update(instance, validated_data)

        old_urls = [instance.photo_url, instance.thumbnail_url]
        photo_url, thumbnail_url = self._process_photo(photo)
        validated_data["photo_url"] = photo_url
        validated_data["thumbnail_url"] = thumbnail_url
        instance = super().update(instance, validated_data)
        # Delete the old blobs only after the new URLs are persisted, so a failed
        # upload never orphans the record without an image (§5.4).
        blob_cleanup.delete_blob_urls(old_urls)
        return instance


class GoalSerializer(serializers.ModelSerializer):
    """Goal list/create shape (P6, AC-4).

    Declarative goal: metric + target + direction + optional deadline + note.
    ``user`` is read-only — the viewset forces it to ``request.user`` on create
    (mvp-routes.md §C). ``is_completed`` is read-only here; the toggle is P7's
    ``PATCH`` route. All error ``detail`` values are translation *keys* (epic Q6):
    ``invalid_metric``, ``invalid_direction``, ``missing_target``,
    ``target_out_of_range``.
    """

    # Plain CharFields (not ChoiceField) so a bad choice routes through our own
    # translatable key instead of DRF's English "not a valid choice".
    metric = serializers.CharField()
    direction = serializers.CharField()
    # required=False so a missing target returns our ``missing_target`` key from
    # validate() rather than DRF's English "required".
    target_value = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )

    class Meta:
        model = Goal
        fields = (
            "id",
            "user",
            "metric",
            "target_value",
            "direction",
            "target_date",
            "is_completed",
            "description",
            "created_at",
        )
        read_only_fields = ("user", "is_completed", "created_at")

    # Tight target band (metric-unaware; the app is metric-only, §3). Wide enough
    # for weight (kg) and circumferences (cm); body-fat percent is small but the
    # ceiling harmlessly admits it.
    _TARGET_LO = 0
    _TARGET_HI = 1000

    def validate_metric(self, value: str) -> str:
        if value not in GoalMetric.values:
            raise serializers.ValidationError("invalid_metric")
        return value

    def validate_direction(self, value: str) -> str:
        if value not in GoalDirection.values:
            raise serializers.ValidationError("invalid_direction")
        return value

    def validate(self, attrs: dict) -> dict:
        creating = self.instance is None
        target = attrs.get("target_value")
        if target is None and creating:
            raise serializers.ValidationError({"target_value": "missing_target"})
        if target is not None and (
            target < self._TARGET_LO or target > self._TARGET_HI
        ):
            raise serializers.ValidationError(
                {"target_value": "target_out_of_range"}
            )
        return attrs


class GoalToggleSerializer(serializers.ModelSerializer):
    """Toggle-complete write path for a goal (P7 §5.2).

    A single writable field — ``is_completed`` — so the owner trainee *or* the
    trainer who owns the trainee can flip completion via ``PATCH /goals/:id``
    without being able to rewrite the goal's metric/target/direction (those stay
    owned by trainee-only create). The permission
    (:class:`~core.api.permissions.GoalAccessPermission`) already admits the PATCH.
    """

    class Meta:
        model = Goal
        fields = ("id", "is_completed")


class MessageSerializer(serializers.ModelSerializer):
    """Read shape for a chat message (P8 §5.2).

    ``mine`` (``sender == request.user``) lets the SPA align bubbles left/right
    without leaking identity logic into the client. Read-only — sending goes
    through :class:`MessageCreateSerializer`. Requires ``request`` in the
    serializer context.
    """

    mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = (
            "id",
            "sender",
            "receiver",
            "content",
            "created_at",
            "read_at",
            "mine",
        )

    def get_mine(self, obj: Message) -> bool:
        request = self.context.get("request")
        return bool(request and obj.sender_id == request.user.pk)


class MessageCreateSerializer(serializers.Serializer):
    """Write path for sending a message (P8 §5.2, §5.4).

    Input is ``{to, content}``. ``sender`` is always ``request.user`` (never
    client-supplied); ``receiver`` is resolved from ``to``. The trainer<->trainee
    relationship is gated by
    :class:`~core.api.permissions.MessageAccessPermission` (403 for a stranger
    recipient), so this serializer only validates existence + non-empty content.
    Error ``detail`` values are translation *keys* (epic Q6): ``unknown_recipient``,
    ``empty_message``.
    """

    to = serializers.IntegerField()
    # allow_blank + no trim so a blank/whitespace body routes through our own
    # translatable ``empty_message`` key in validate_content (epic Q6) instead of
    # DRF's English "may not be blank".
    content = serializers.CharField(
        max_length=4000, allow_blank=True, trim_whitespace=False
    )

    def validate_to(self, value: int) -> int:
        recipient = CustomUser.objects.filter(pk=value).first()
        if recipient is None:
            raise serializers.ValidationError("unknown_recipient")
        self._recipient = recipient
        return value

    def validate_content(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("empty_message")
        return value

    def save(self) -> Message:
        request = self.context["request"]
        return Message.objects.create(
            sender=request.user,
            receiver=self._recipient,
            content=self.validated_data["content"],
        )
