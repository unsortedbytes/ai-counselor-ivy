from django.db import migrations

# Inlined: the essay prompt model was removed from the app in 0003.
PROMPTS = [
    {
        "slug": "life-experience-personal-story",
        "title": "Life experience & your personal story",
        "text": (
            "How has your life experience contributed to your personal story—your character, "
            "values, perspectives, or skills—and what you want to pursue at (this college)?"
        ),
        "word_limit": 350,
    }
]


def seed(apps, schema_editor):
    EssayPrompt = apps.get_model("brainstorm", "EssayPrompt")
    for p in PROMPTS:
        EssayPrompt.objects.update_or_create(slug=p["slug"], defaults=p)


class Migration(migrations.Migration):
    dependencies = [("brainstorm", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
