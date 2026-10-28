"""Back to essay brainstorming: information capture → essay structure.

As in 0003, models and fields of the previous version are removed from Django's
state only; their MongoDB collections and fields are left untouched. The
`brainstorm_essayprompt` collection was created in 0001 and never dropped, so
EssayPrompt is re-added to the state without recreating it.
"""

import django.db.models.deletion
import django_mongodb_backend.fields
from django.db import migrations, models

QUESTIONS = {
    "learning-to-let-go": [
        {"label": "What you held on to", "question": "What was the plan, belief, relationship or version of yourself you were holding on to?"},
        {"label": "The moment", "question": "When did you realise you had to let it go? Take me to that moment."},
        {"label": "Letting go", "question": "What made it hard, and what did you actually do?"},
        {"label": "What you gained", "question": "What did you learn or gain instead, and how do you act differently now?"},
        {"label": "Looking ahead", "question": "How does this shape what you want to pursue at college?"},
    ],
    "life-experience-personal-story": [
        {"label": "Your experience", "question": "Which life experience has shaped you the most?"},
        {"label": "The details", "question": "Take me back to one specific moment from it: where were you and what happened?"},
        {"label": "Character & values", "question": "What did it reveal or build in you: character, values, perspectives or skills?"},
        {"label": "Evidence of change", "question": "When did you later act differently because of it?"},
        {"label": "Why this college", "question": "What do you want to pursue at college, and how does this experience lead there?"},
    ],
    "why-this-college": [
        {"label": "Academic", "question": "Which majors, courses or professors at this college excite you, and why?"},
        {"label": "Extracurricular", "question": "Which clubs, teams or activities would you join or start?"},
        {"label": "Community", "question": "What about the student community and culture fits who you are?"},
        {"label": "Professional", "question": "What internships and professional organisations are available to students?"},
        {"label": "City, where applicable", "question": "What city-wide offerings are available that relate to professional or goal-related interests?"},
    ],
}

PROMPTS = [
    {
        "slug": "learning-to-let-go",
        "title": "Learning to let go",
        "text": (
            "Describe a time you had to let go of something: a plan, a belief, a relationship or a "
            "version of yourself. What did you learn, and how has it shaped who you are today?"
        ),
        "word_limit": 250,
    },
    {
        "slug": "life-experience-personal-story",
        "title": "Life experience & your personal story",
        "text": (
            "How has your life experience contributed to your personal story—your character, "
            "values, perspectives, or skills—and what you want to pursue at (this college)?"
        ),
        "word_limit": 350,
    },
    {
        "slug": "why-this-college",
        "title": "Why this college?",
        "text": (
            "Why are you interested in attending (this college)? Tell us about the academic, "
            "community and professional opportunities that draw you here."
        ),
        "word_limit": 250,
    },
]


def seed(apps, schema_editor):
    EssayPrompt = apps.get_model("brainstorm", "EssayPrompt")
    for p in PROMPTS:
        EssayPrompt.objects.update_or_create(slug=p["slug"], defaults={**p, "questions": QUESTIONS[p["slug"]]})


NEW_DEFAULTS = {
    "essayprompt": {"questions": []},
    "brainstormsession": {
        "college": "",
        "essay_title": "",
        "prompt_text": "",
        "word_limit": 350,
        "questions": [],
        "current_question": 0,
    },
    "turn": {"stage": "capture", "question": 0},
}


def fill_missing_defaults(apps, schema_editor):
    db = schema_editor.connection.database
    for model, fields in NEW_DEFAULTS.items():
        collection = db[apps.get_model("brainstorm", model)._meta.db_table]
        for field, default in fields.items():
            collection.update_many({field: {"$exists": False}}, {"$set": {field: default}})


class Migration(migrations.Migration):
    dependencies = [("brainstorm", "0003_career_discovery")]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name="EssayPrompt",
                    fields=[
                        ("id", django_mongodb_backend.fields.ObjectIdAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("slug", models.SlugField(unique=True)),
                        ("title", models.CharField(max_length=200)),
                        ("text", models.TextField()),
                        ("word_limit", models.PositiveIntegerField(default=350)),
                        ("is_active", models.BooleanField(default=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                    ],
                    options={"ordering": ["id"]},
                ),
                migrations.RemoveField("brainstormsession", "interests"),
                migrations.RemoveField("brainstormsession", "phase"),
                migrations.DeleteModel("Insight"),
                migrations.DeleteModel("CareerReport"),
                migrations.DeleteModel("ChatMessage"),
            ],
            database_operations=[],
        ),
        # On MongoDB, AddField $sets the default on every document, which would wipe the
        # `college` that essay-era sessions (from before 0003) still carry. So add the
        # fields in state only and fill defaults just where a field is missing.
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField("essayprompt", "questions", models.JSONField(blank=True, default=list)),
                migrations.AddField("brainstormsession", "college", models.CharField(blank=True, max_length=200)),
                migrations.AddField("brainstormsession", "essay_title", models.CharField(blank=True, max_length=200)),
                migrations.AddField("brainstormsession", "prompt_text", models.TextField(blank=True)),
                migrations.AddField("brainstormsession", "word_limit", models.PositiveIntegerField(default=350)),
                migrations.AddField("brainstormsession", "questions", models.JSONField(blank=True, default=list)),
                migrations.AddField("brainstormsession", "current_question", models.PositiveSmallIntegerField(default=0)),
                migrations.AddField(
                    "turn", "stage",
                    models.CharField(choices=[("capture", "Capture"), ("structure", "Structure")], default="capture", max_length=10),
                ),
                migrations.AddField("turn", "question", models.PositiveSmallIntegerField(default=0)),
            ],
            database_operations=[migrations.RunPython(fill_missing_defaults, migrations.RunPython.noop)],
        ),
        migrations.AlterField(
            model_name="brainstormsession",
            name="status",
            field=models.CharField(
                choices=[
                    ("created", "Created"),
                    ("capturing", "Capturing"),
                    ("drafting", "Drafting"),
                    ("structuring", "Structuring"),
                    ("completed", "Completed"),
                    ("failed", "Failed"),
                ],
                default="created",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="Answer",
            fields=[
                ("id", django_mongodb_backend.fields.ObjectIdAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("number", models.PositiveSmallIntegerField()),
                ("text", models.TextField()),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="answers", to="brainstorm.brainstormsession")),
            ],
            options={
                "ordering": ["number"],
                "constraints": [models.UniqueConstraint(fields=("session", "number"), name="one_answer_per_question")],
            },
        ),
        migrations.CreateModel(
            name="EssayStructure",
            fields=[
                ("id", django_mongodb_backend.fields.ObjectIdAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("model_name", models.CharField(max_length=100)),
                ("data", models.JSONField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("session", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="structure", to="brainstorm.brainstormsession")),
            ],
        ),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
