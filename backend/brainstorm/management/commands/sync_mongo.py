"""Check the MongoDB connection and copy every brainstorm into Atlas.

    python manage.py sync_mongo            # backfill all brainstorms
    python manage.py sync_mongo --check    # just test the connection
"""

from django.core.management.base import BaseCommand, CommandError

from brainstorm import mongo
from brainstorm.models import BrainstormSession


class Command(BaseCommand):
    help = "Backfill MongoDB with a document per brainstorm (and verify the connection)."

    def add_arguments(self, parser):
        parser.add_argument("--check", action="store_true", help="Only test the connection")

    def handle(self, *args, check=False, **opts):
        if not mongo.enabled():
            raise CommandError("MONGODB_URI is not set.")
        db = mongo.get_db()
        if db is None:
            raise CommandError(f"Can't reach MongoDB: {mongo.status()['error']}")
        self.stdout.write(self.style.SUCCESS(f"Connected to database '{db.name}'."))
        if check:
            return
        ids = list(BrainstormSession.objects.values_list("id", flat=True))
        for sid in ids:
            mongo._sync_now(db, str(sid))
        self.stdout.write(self.style.SUCCESS(f"Synced {len(ids)} brainstorm(s); collection now has {db.brainstorms.count_documents({})}."))
