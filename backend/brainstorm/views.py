"""JSON API for essay brainstorming. Plain Django views — the surface is small."""

import datetime as dt
import json
import logging
import threading
import time
from functools import wraps

from django.db import close_old_connections
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from . import ai, guard, mongo
from .models import DEFAULT_QUESTIONS, Answer, BrainstormSession, EssayPrompt, EssayStructure, Turn

log = logging.getLogger(__name__)

Status = BrainstormSession.Status


class BadRequest(Exception):
    pass


def api(*methods, public: bool = False):
    """JSON endpoint with uniform error handling; requires login unless `public`.

    CSRF tokens aren't used: the session cookie is SameSite=Lax, so browsers
    don't attach it to cross-site POSTs, and every write expects a JSON body.
    """

    def deco(fn):
        @csrf_exempt
        @require_http_methods(list(methods))
        @wraps(fn)
        def wrapper(request, *args, **kwargs):
            if not public and not request.user.is_authenticated:
                return JsonResponse({"error": "Please log in."}, status=401)
            try:
                if request.body and request.content_type == "application/json":
                    request.json = json.loads(request.body)
                else:
                    request.json = {}
                result = fn(request, *args, **kwargs)
                if isinstance(result, HttpResponse):
                    return result
                if isinstance(result, tuple):
                    body, status = result
                    return JsonResponse(body, status=status, safe=False)
                return JsonResponse(result, safe=False)
            except (BadRequest, json.JSONDecodeError) as e:
                return JsonResponse({"error": str(e)}, status=400)
            except Http404:
                return JsonResponse({"error": "Not found."}, status=404)
            except ai.AIConfigError as e:
                return JsonResponse({"error": str(e)}, status=503)

        return wrapper

    return deco


def required(data: dict, *fields: str) -> list[str]:
    values = [str(data.get(f) or "").strip() for f in fields]
    missing = [f for f, v in zip(fields, values) if not v]
    if missing:
        raise BadRequest(f"Missing field(s): {', '.join(missing)}")
    return values


def _int(value, name: str, lo: int, hi: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise BadRequest(f"{name} must be a number") from None
    if not lo <= n <= hi:
        raise BadRequest(f"{name} must be between {lo} and {hi}")
    return n


# --- serializers -------------------------------------------------------------

def session_json(s: BrainstormSession, full: bool = True) -> dict:
    data = {
        "id": str(s.id),
        "student_name": s.student_name,
        "grade": s.grade,
        "college": s.college,
        "essay_title": s.essay_title,
        "prompt_text": s.prompt_text,
        "word_limit": s.word_limit,
        "question_count": len(s.questions),
        "status": s.status,
        "error": s.error,
        "created_at": s.created_at.isoformat(),
    }
    if full:
        structure = getattr(s, "structure", None)
        data |= {
            "questions": s.questions,
            "current_question": s.current_question,
            "interview_summary": s.interview_summary,
            "turns": [
                {"role": t.role, "text": t.text, "seq": t.seq, "stage": t.stage, "question": t.question}
                for t in s.turns.all()
            ],
            "answers": [{"number": a.number, "text": a.text} for a in s.answers.all()],
            "structure": structure.data if structure else None,
            "structure_model": structure.model_name if structure else None,
        }
    return data


# --- endpoints ---------------------------------------------------------------

@api("GET", public=True)
def health(request):
    from django.conf import settings

    gemini = settings.AI_PROVIDER == "gemini"
    return {
        "ok": True,
        "provider": settings.AI_PROVIDER,
        "api_key": bool(settings.GEMINI_API_KEY if gemini else settings.OPENAI_API_KEY),
        "voice_model": settings.GEMINI_LIVE_MODEL if gemini else settings.REALTIME_MODEL,
        "llm_model": settings.GEMINI_STRATEGY_MODEL if gemini else settings.LLM_MODEL,
        "strategist_mock": settings.STRATEGIST_MOCK,
        "database": "mongodb",
        # Connects lazily, so the first health check also warms up the log writer.
        "mongodb": "connected" if mongo.get_db() is not None else mongo.status()["state"],
    }


@api("GET")
def prompts(request):
    return [
        {"slug": p.slug, "title": p.title, "text": p.text, "word_limit": p.word_limit, "question_count": len(p.questions)}
        for p in EssayPrompt.objects.filter(is_active=True)
    ]


@api("GET", "POST")
def sessions(request):
    if request.method == "GET":
        # Sessions from the old career-discovery version have no essay prompt.
        qs = BrainstormSession.objects.filter(user=request.user).exclude(prompt_text="")[:50]
        return [session_json(s, full=False) for s in qs]

    body = request.json
    name, college = required(body, "student_name", "college")
    slug = str(body.get("prompt") or "")
    if slug:
        p = get_object_or_404(EssayPrompt, slug=slug, is_active=True)
        title, text, limit, questions = p.title, p.text, p.word_limit, p.questions or DEFAULT_QUESTIONS
        if body.get("word_limit"):
            limit = _int(body["word_limit"], "word_limit", 50, 1500)
    else:
        title, text = required(body, "essay_title", "prompt_text")
        limit = _int(body.get("word_limit") or 350, "word_limit", 50, 1500)
        questions = DEFAULT_QUESTIONS
    s = BrainstormSession.objects.create(
        user=request.user,
        student_name=name[:120],
        grade=str(body.get("grade") or "")[:40],
        college=college[:200],
        essay_title=title[:200],
        prompt_text=text[:3000],
        word_limit=limit,
        questions=questions,
    )
    log.info("brainstorm created", extra={"event": "session.created", "session_id": str(s.id), "user_id": request.user.id})
    return session_json(s), 201


def _get_session(pk, user=None) -> BrainstormSession:
    qs = BrainstormSession.objects.prefetch_related("turns", "answers")
    # Someone else's session is a 404, not a 403, so ids can't be probed.
    return get_object_or_404(qs.filter(user=user) if user else qs, pk=pk)


def _owned(request, pk) -> BrainstormSession:
    return get_object_or_404(BrainstormSession, pk=pk, user=request.user)


# A generation thread dies with its worker (deploy, restart, crash) and would
# leave the session "drafting" forever; past this age, surface it as failed.
STALE_AFTER = dt.timedelta(minutes=15)


def _expire_stale(s: BrainstormSession) -> None:
    if s.status == Status.DRAFTING and timezone.now() - s.updated_at >= STALE_AFTER:
        s.status = Status.FAILED
        s.error = "Generation was interrupted (the server restarted). Please try again."
        s.save(update_fields=["status", "error"])  # keeps updated_at so the clock isn't reset


@api("GET")
def session_detail(request, pk):
    s = _get_session(pk, request.user)
    _expire_stale(s)
    return session_json(s)


@api("POST")
def realtime_token(request, pk):
    s = _get_session(pk, request.user)
    if s.status not in (Status.CREATED, Status.CAPTURING, Status.STRUCTURING):
        raise BadRequest("There's no voice step to continue right now.")
    secret = ai.mint_voice_session(s)
    log.info("voice session started", extra={"event": "voice.token", "session_id": str(s.pk), "user_id": request.user.id, "model": secret.get("model"), "stage": s.status})
    if s.status == Status.CREATED:
        s.status = Status.CAPTURING
    s.started_at = s.started_at or timezone.now()
    s.save(update_fields=["status", "started_at", "updated_at"])
    return secret


@api("POST")
def add_turn(request, pk):
    s = _owned(request, pk)
    role, text = required(request.json, "role", "text")
    if role not in Turn.Role.values:
        raise BadRequest("role must be 'user' or 'assistant'")
    seq = int(request.json.get("seq") or 0)
    stage = Turn.Stage.STRUCTURE if s.status == Status.STRUCTURING else Turn.Stage.CAPTURE
    question = _int(request.json.get("question") or 0, "question", 0, len(s.questions))
    # Upsert on seq so a retried POST doesn't duplicate a turn.
    Turn.objects.update_or_create(
        session=s, seq=seq, role=role, defaults={"text": text, "stage": stage, "question": question}
    )
    return {"ok": True}, 201


def _no_injection(*texts: str) -> None:
    """Keep injected instructions out of saved answers / guidance (they feed the strategist and PDF)."""
    if any(guard.is_injection(t) for t in texts):
        raise BadRequest("That doesn't look like part of the essay, so it wasn't saved.")


@api("POST")
def check_message(request):
    """Screen a typed message before it reaches the voice model."""
    (text,) = required(request.json, "text")
    kind = guard.check(text)
    if kind:
        log.info("guardrail blocked message", extra={"event": "guard.block", "kind": kind, "user_id": request.user.id})
    return {"blocked": kind, "message": guard.MESSAGES.get(kind, "")}


@api("POST")
def set_question(request, pk):
    s = _owned(request, pk)
    s.current_question = _int(request.json.get("number"), "number", 1, len(s.questions))
    s.save(update_fields=["current_question", "updated_at"])
    return {"current_question": s.current_question}


@api("POST")
def save_answer(request, pk):
    s = _owned(request, pk)
    number = _int(request.json.get("number"), "number", 1, len(s.questions))
    (text,) = required(request.json, "text")
    _no_injection(text)
    Answer.objects.update_or_create(session=s, number=number, defaults={"text": text[:3000]})
    return {"number": number, "text": text}, 201


@api("POST")
def finalize(request, pk):
    """End information capture (or retry a failed draft) and draft the essay structure.

    Reasoning models can take tens of seconds, so the client polls
    `GET /sessions/<id>` instead of holding a request open.
    """
    s = _owned(request, pk)
    if not s.answers.exists() and not s.turns.filter(role=Turn.Role.USER).exists():
        raise BadRequest("Answer at least one question first — there's nothing to build from yet.")
    summary = str(request.json.get("summary") or "").strip()
    now = timezone.now()
    # Claim the job with one conditional update — atomic on a MongoDB document —
    # so a double-click or retry can never start the same generation twice, and
    # an already-built structure is never overwritten.
    claimed = (
        BrainstormSession.objects.filter(pk=s.pk, status__in=[Status.CREATED, Status.CAPTURING, Status.FAILED])
        .update(
            status=Status.DRAFTING,
            error="",
            ended_at=s.ended_at or now,
            updated_at=now,
            **({"interview_summary": summary} if summary else {}),
        )
    )
    if claimed:
        log.info("capture finished", extra={"event": "session.finalized", "session_id": str(s.pk), "user_id": request.user.id})
        threading.Thread(target=_run_structure, args=(s.pk,), daemon=True).start()
    return {"status": Status.DRAFTING}, 202


def _run_structure(pk):
    close_old_connections()
    s = _get_session(pk)
    t0 = time.monotonic()
    try:
        data, model = ai.generate_structure(s)
        log.info("structure ready", extra={"event": "ai.structure", "ok": True, "session_id": str(pk), "model": model, "seconds": round(time.monotonic() - t0, 1)})
        EssayStructure.objects.update_or_create(session=s, defaults={"data": data, "model_name": model})
        s.status = Status.STRUCTURING
    except Exception as e:  # surfaced to the UI, which offers a retry
        log.exception("structure failed for %s", pk, extra={"event": "ai.structure", "ok": False, "session_id": str(pk), "seconds": round(time.monotonic() - t0, 1)})
        s.status = Status.FAILED
        s.error = str(e)[:1000]
    s.save(update_fields=["status", "error", "updated_at"])
    close_old_connections()


def _clean_section(raw: dict, old: dict | None = None) -> dict:
    old = old or {}
    material = raw.get("student_material", old.get("student_material", []))
    if not isinstance(material, list):
        raise BadRequest("student_material must be a list")
    return {
        "title": str(raw.get("title") or old.get("title") or "Section")[:120],
        "purpose": str(raw.get("purpose", old.get("purpose", "")))[:500],
        "word_count": _int(raw.get("word_count", old.get("word_count", 0)), "word_count", 0, 1500),
        "guidance": str(raw.get("guidance", old.get("guidance", "")))[:2000],
        "student_material": [str(m)[:500] for m in material][:10],
    }


@api("POST")
def update_section(request, pk, number):
    """Ivy refines one section live while talking the structure through."""
    s = _get_session(pk, request.user)
    structure = getattr(s, "structure", None)
    if structure is None or s.status != Status.STRUCTURING:
        raise BadRequest("The structure isn't open for changes right now.")
    sections = structure.data.get("sections", [])
    if not 1 <= number <= len(sections):
        raise BadRequest(f"There is no section {number}.")
    _no_injection(str(request.json.get("guidance", "")), *map(str, request.json.get("student_material") or []))
    sections[number - 1] = _clean_section(request.json, sections[number - 1])
    structure.save(update_fields=["data", "updated_at"])
    return {"number": number, "section": sections[number - 1]}


@api("PUT")
def structure(request, pk):
    """Save the student's own edits from the Review & Edit page."""
    s = _get_session(pk, request.user)
    current = getattr(s, "structure", None)
    if current is None or s.status not in (Status.STRUCTURING, Status.COMPLETED):
        raise BadRequest("There's no structure to edit yet.")
    raw = request.json.get("sections")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 12:
        raise BadRequest("Give between 1 and 12 sections.")
    current.data["sections"] = [_clean_section(x) for x in raw]
    for key in ("working_title", "central_theme", "thesis"):
        if key in request.json:
            current.data[key] = str(request.json[key])[:500]
    current.save(update_fields=["data", "updated_at"])
    return current.data


@api("POST")
def complete(request, pk):
    s = _get_session(pk, request.user)
    if getattr(s, "structure", None) is None:
        raise BadRequest("There's no structure to finish yet.")
    if s.status != Status.COMPLETED:
        s.status = Status.COMPLETED
        s.save(update_fields=["status", "updated_at"])
    return session_json(s)


@api("GET")
def report_pdf(request, pk):
    from .report import render_pdf

    s = _get_session(pk, request.user)
    if getattr(s, "structure", None) is None:
        raise BadRequest("The essay structure isn't ready yet.")
    response = HttpResponse(render_pdf(s), content_type="application/pdf")
    name = slugify(f"{s.college} {s.essay_title}") or "essay-structure"
    response["Content-Disposition"] = f'attachment; filename="{name}.pdf"'
    return response
