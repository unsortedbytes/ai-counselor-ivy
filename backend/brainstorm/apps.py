from django.apps import AppConfig


class BrainstormConfig(AppConfig):
    default_auto_field = "django_mongodb_backend.fields.ObjectIdAutoField"
    name = "brainstorm"

    def ready(self):
        from . import signals  # noqa: F401  (registers the MongoDB sync)
