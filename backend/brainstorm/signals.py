"""Mirror every brainstorm change into MongoDB (after the DB transaction commits)."""

from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from . import mongo
from .models import Answer, BrainstormSession, EssayStructure, Turn

CHILD_MODELS = (Turn, Answer, EssayStructure)


def _schedule(session_id):
    if mongo.enabled() and settings.MONGODB_MIRROR_DOCUMENTS and session_id:
        transaction.on_commit(lambda: mongo.schedule_sync(session_id))


@receiver([post_save, post_delete], sender=BrainstormSession)
def session_changed(sender, instance, **kwargs):
    _schedule(instance.pk)


for model in CHILD_MODELS:
    @receiver([post_save, post_delete], sender=model, weak=False, dispatch_uid=f"mongo-sync-{model.__name__}")
    def child_changed(sender, instance, **kwargs):
        _schedule(instance.session_id)
