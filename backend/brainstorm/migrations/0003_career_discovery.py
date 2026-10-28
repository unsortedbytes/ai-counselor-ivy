"""Refocus on career discovery: drop the essay, tracker and CV features.

Removed models and fields leave Django's state only. Their MongoDB collections
and fields stay in the database untouched (this migration runs on every deploy),
so drop `brainstorm_essayprompt`, `brainstorm_essaystrategy`, `brainstorm_task`
and `brainstorm_cvreview` by hand once you no longer need the old data.
"""

from django.db import migrations, models

# The career report used to have its own status; it is now the session's status.
CAREER_TO_STATUS = {"completed": "completed", "failed": "failed", "generating": "failed", "none": "interviewing"}


def career_status_to_status(apps, schema_editor):
    BrainstormSession = apps.get_model("brainstorm", "BrainstormSession")
    for s in BrainstormSession.objects.filter(status__in=["analyzing", "completed", "failed"]):
        s.status = CAREER_TO_STATUS.get(s.career_status, "interviewing")
        s.error = s.career_error if s.status == "failed" else ""
        if s.career_status == "generating":
            s.error = "Generation was interrupted. Please try again."
        s.save(update_fields=["status", "error"])


class Migration(migrations.Migration):
    dependencies = [("brainstorm", "0002_seed_prompts")]

    operations = [
        migrations.RunPython(career_status_to_status, migrations.RunPython.noop),
        migrations.RenameField("brainstormsession", "intended_major", "interests"),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField("brainstormsession", "prompt"),
                migrations.RemoveField("brainstormsession", "college"),
                migrations.RemoveField("brainstormsession", "career_status"),
                migrations.RemoveField("brainstormsession", "career_error"),
                migrations.RemoveField("chatmessage", "suggested_tasks"),
                migrations.DeleteModel("EssayStrategy"),
                migrations.DeleteModel("Task"),
                migrations.DeleteModel("CvReview"),
                migrations.DeleteModel("EssayPrompt"),
            ],
            database_operations=[],
        ),
        migrations.AlterField(
            model_name="brainstormsession",
            name="phase",
            field=models.CharField(
                choices=[
                    ("warmup", "Getting to know you"),
                    ("interests", "Subjects & interests"),
                    ("strengths", "Strengths & skills"),
                    ("work_style", "What matters to you"),
                    ("careers", "Careers you're curious about"),
                    ("wrap_up", "Wrap-up"),
                ],
                default="warmup",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="insight",
            name="category",
            field=models.CharField(
                choices=[
                    ("subject", "Subject"),
                    ("interest", "Interest"),
                    ("strength", "Strength"),
                    ("skill", "Skill"),
                    ("value", "Value"),
                    ("work_style", "Work Style"),
                    ("career_idea", "Career Idea"),
                    ("concern", "Concern"),
                ],
                max_length=20,
            ),
        ),
    ]
