"""The Message model — the chat leg of the core loop (P8).

The core loop is *trainee logs data -> trainer reviews -> **they talk***. Chat is
the "they talk". The old build did chat as HTML-partial polling that re-fetched
the whole thread every poll (rebuild-analysis.md §2 #5); P8 replaces it with a
real API backed by this model.

Design (plan P8 §5.1):

* Text only — no attachments, no blob (so no blob cleanup for messages).
* ``created_at`` drives the ``since`` incremental poll (fetch only newer
  messages, never the whole thread).
* ``read_at`` is the single mark-read timestamp (mark-read once, not per poll).
* Both FKs ``CASCADE`` so deleting a user (account-delete, §5.6) removes their
  messages; a trainer's removal never orphans a thread.
* Composite index ``(sender, receiver, created_at)`` backs the thread + ``since``
  query; ``(receiver, read_at)`` backs the unread scan for mark-read.

The trainer<->trainee relationship is **not** re-encoded here — chat access is
gated by ``CustomUser.can_communicate_with`` (the symmetric wrapper over the
single ``can_access`` predicate), consumed by ``MessageAccessPermission``.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models


class Message(models.Model):
    """One chat message from ``sender`` to ``receiver`` in a 1:1 thread."""

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_messages",
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_messages",
    )
    content = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True)
    # Set once when the receiver marks the thread read (mark-read once, §5.4).
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            # Thread + ``since`` query (AC-2): both directions of a pair filter on
            # (sender, receiver) and order/filter by created_at.
            models.Index(fields=["sender", "receiver", "created_at"]),
            # Unread scan for mark-read (receiver's inbox, unread only).
            models.Index(fields=["receiver", "read_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.sender_id}->{self.receiver_id} @ {self.created_at:%Y-%m-%d %H:%M}"
