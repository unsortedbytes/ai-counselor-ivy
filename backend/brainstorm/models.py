import uuid

from django.conf import settings
from django.db import models

# Used when a student types their own prompt: the interviewer still needs a
# fixed set of questions to work through and count on the progress bar.
DEFAULT_QUESTIONS = [
    {"label": "The story", "question": "What experience or moment comes to mind first when you read this prompt?"},
    {"label": "The details", "question": "Take me back to that moment: where were you, what did you see, hear and do?"},
    {"label": "The turning point", "question": "What was hard about it, and what changed for you?"},
    {"label": "Who you became", "question": "What does this show about your character, values or the way you think now?"},
    {"label": "Looking ahead", "question": "How does this connect to what you want to study or do at college?"},
]


class EssayPrompt(models.Model):
    """A prompt in the library students pick from; sessions copy what they need."""

    slug = models.SlugField(unique=True)
    title = models.CharField(max_length=200)
    text = models.TextField()
    word_limit = models.PositiveIntegerField(default=350)
    # [{"label": "Professional", "question": "What internships ...?"}]
    questions = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.title


class BrainstormSession(models.Model):
    class Status(models.TextChoices):
        CREATED = "created"
        # Stage 1: Ivy asks the prompt's questions and captures the answers.
        CAPTURING = "capturing"
        # The strategist is drafting the essay structure from the answers.
        DRAFTING = "drafting"
        # Stage 2: Ivy and the student refine the structure together.
        STRUCTURING = "structuring"
        # The student has reviewed and saved the structure; the report is final.
        COMPLETED = "completed"
        FAILED = "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Nullable only so sessions created before accounts existed survive the migration.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="brainstorms"
    )
    student_name = models.CharField(max_length=120)
    grade = models.CharField(max_length=40, blank=True)
    college = models.CharField(max_length=200, blank=True)
    # e.g. "Essay 1: Learning to let go"
    essay_title = models.CharField(max_length=200, blank=True)
    prompt_text = models.TextField(blank=True)
    word_limit = models.PositiveIntegerField(default=350)
    questions = models.JSONField(default=list, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CREATED)
    # 1-based number of the question Ivy is on; 0 before the first one.
    current_question = models.PositiveSmallIntegerField(default=0)
    interview_summary = models.TextField(blank=True)
    error = models.TextField(blank=True)

    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.student_name} → {self.college}: {self.essay_title} ({self.status})"


class Turn(models.Model):
    class Role(models.TextChoices):
        USER = "user"
        ASSISTANT = "assistant"

    class Stage(models.TextChoices):
        CAPTURE = "capture"
        STRUCTURE = "structure"

    session = models.ForeignKey(BrainstormSession, on_delete=models.CASCADE, related_name="turns")
    role = models.CharField(max_length=10, choices=Role.choices)
    text = models.TextField()
    stage = models.CharField(max_length=10, choices=Stage.choices, default=Stage.CAPTURE)
    # The capture question this turn belongs to (0 = none), for the "4. Professional" headings.
    question = models.PositiveSmallIntegerField(default=0)
    # Client-side ordering index: user transcripts can finish *after* the
    # assistant has started replying, so arrival order is not turn order.
    seq = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["seq", "created_at"]


class Answer(models.Model):
    """The student's answer to one capture question, summarised by Ivy."""

    session = models.ForeignKey(BrainstormSession, on_delete=models.CASCADE, related_name="answers")
    number = models.PositiveSmallIntegerField()
    text = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["number"]
        constraints = [models.UniqueConstraint(fields=["session", "number"], name="one_answer_per_question")]


class EssayStructure(models.Model):
    session = models.OneToOneField(BrainstormSession, on_delete=models.CASCADE, related_name="structure")
    model_name = models.CharField(max_length=100)
    data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class EmailOTP(models.Model):
    """A one-time login code sent by email. Only a hash of the code is stored."""

    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
