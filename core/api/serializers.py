"""Serializers for the auth surface.

Validation logic lives here (thin views — epic §3). All error ``detail`` values
are translation *keys*, not English prose, so the frontend localizes (epic Q6).
"""
from __future__ import annotations

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from core.models import CustomUser, Role


class UserSerializer(serializers.ModelSerializer):
    """Public user shape: id, username, role only. No password/email leak."""

    class Meta:
        model = CustomUser
        fields = ("id", "username", "role")


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
