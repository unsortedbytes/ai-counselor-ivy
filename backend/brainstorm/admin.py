from django.contrib import admin

from .models import Answer, BrainstormSession, EssayPrompt, EssayStructure, Turn


class TurnInline(admin.TabularInline):
    model = Turn
    extra = 0


class AnswerInline(admin.TabularInline):
    model = Answer
    extra = 0


@admin.register(BrainstormSession)
class BrainstormSessionAdmin(admin.ModelAdmin):
    list_display = ("student_name", "user", "college", "essay_title", "status", "created_at")
    list_filter = ("status",)
    inlines = [AnswerInline, TurnInline]


@admin.register(EssayPrompt)
class EssayPromptAdmin(admin.ModelAdmin):
    list_display = ("title", "word_limit", "is_active")


admin.site.register(EssayStructure)
