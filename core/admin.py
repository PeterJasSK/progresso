"""Django admin registration.

Admin lives in Django ``/admin/``, outside the SPA (epic §3 API-first).
"""
from __future__ import annotations

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from core.models import CustomUser, Measurement

# Expose the extra relationship/role fields on the stock UserAdmin form.
_extra = ("role", "head_trainer", "helpers")


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Progresso", {"fields": _extra}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Progresso", {"fields": ("role",)}),)
    list_display = ("username", "email", "role", "head_trainer", "is_staff")
    list_filter = UserAdmin.list_filter + ("role",)
    filter_horizontal = UserAdmin.filter_horizontal + ("helpers",)


@admin.register(Measurement)
class MeasurementAdmin(admin.ModelAdmin):
    """Admin spot-check surface (outside the SPA, epic §3)."""

    list_display = ("user", "created_at", "weight", "unit_system")
    list_filter = ("unit_system",)
