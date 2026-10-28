"""MongoDB extras next to the Django data (which django-mongodb-backend stores
in the same Atlas database):

  * `logs`        — structured app/audit logs, auto-expiring after N days
  * `brainstorms` — optional one-document-per-brainstorm view
                    (MONGODB_MIRROR_DOCUMENTS=true), handy for analytics/export

Best-effort and off the request path: writes go through a background thread,
so a slow cluster never slows or breaks a request.
"""

import atexit
import datetime as dt
import logging
import queue
import threading
import traceback

from django.conf import settings

log = logging.getLogger(__name__)

_client = None
_client_lock = threading.Lock()
_status = {"state": "disabled", "error": ""}


def enabled() -> bool:
    return bool(settings.MONGODB_URI) and settings.MONGODB_LOGS


def status() -> dict:
    return dict(_status)


def get_db():
    """Lazily connect; returns None when disabled or unreachable."""
    global _client
    if not enabled():
        return None
    with _client_lock:
        if _client is None:
            from pymongo import MongoClient

            try:
                client = MongoClient(
                    settings.MONGODB_URI, appname="ivy-brainstormer", serverSelectionTimeoutMS=5000, tz_aware=True
                )
                db = client[settings.MONGODB_DB]
                client.admin.command("ping")
                _ensure_indexes(db)
                _client = client
                _status.update(state="connected", error="")
            except Exception as e:  # keep the app running; retry on next use
                _status.update(state="error", error=str(e)[:300])
                return None
        return _client[settings.MONGODB_DB]


def _ensure_indexes(db):
    from pymongo import ASCENDING, DESCENDING

    db.logs.create_index([("ts", DESCENDING)])
    db.logs.create_index("ts_expire", expireAfterSeconds=settings.MONGODB_LOG_TTL_DAYS * 86400)
    db.logs.create_index([("level", ASCENDING), ("ts", DESCENDING)])
    db.logs.create_index([("event", ASCENDING), ("ts", DESCENDING)])
    db.logs.create_index("session_id")
    db.brainstorms.create_index("user.id")
    db.brainstorms.create_index([("updated_at", DESCENDING)])


# --- background writer ---------------------------------------------------------

_queue: "queue.Queue[tuple[str, object]]" = queue.Queue(maxsize=10_000)
_worker: threading.Thread | None = None
_worker_lock = threading.Lock()
FLUSH_SECONDS = 2.0


def _start_worker():
    global _worker
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_run_worker, name="mongo-writer", daemon=True)
            _worker.start()


def _enqueue(kind: str, payload):
    if not enabled():
        return
    _start_worker()
    try:
        _queue.put_nowait((kind, payload))
    except queue.Full:
        pass  # shed load rather than block requests


def _run_worker():
    while True:
        batch = [_queue.get()]
        deadline = dt.datetime.now().timestamp() + FLUSH_SECONDS
        while len(batch) < 500:
            timeout = deadline - dt.datetime.now().timestamp()
            if timeout <= 0:
                break
            try:
                batch.append(_queue.get(timeout=timeout))
            except queue.Empty:
                break
        _flush(batch)


def _flush(batch):
    logs = [p for k, p in batch if k == "log"]
    sessions = {p for k, p in batch if k == "session"}  # dedupe: many saves → one sync
    db = get_db()
    if db is None:
        return
    try:
        if logs:
            db.logs.insert_many(logs, ordered=False)
        for sid in sessions:
            _sync_now(db, sid)
    except Exception as e:
        _status.update(state="error", error=str(e)[:300])


def flush_pending(timeout: float = 5.0):
    """Drain the queue synchronously (used at shutdown and by the sync command)."""
    batch = []
    try:
        while True:
            batch.append(_queue.get_nowait())
    except queue.Empty:
        pass
    if batch:
        _flush(batch)


atexit.register(flush_pending)


# --- logs ------------------------------------------------------------------------

# Never ship these record attributes; never ship records marked sensitive.
_STD_ATTRS = set(vars(logging.LogRecord("", 0, "", 0, "", (), None))) | {"message", "asctime"}


class MongoLogHandler(logging.Handler):
    """Logging handler that ships records to the `logs` collection.

    Use `extra={"event": "...", "session_id": ..., "user_id": ...}` for
    structured fields. Records with `extra={"sensitive": True}` (e.g. dev-mode
    OTP codes) are never sent.
    """

    def emit(self, record: logging.LogRecord):
        if getattr(record, "sensitive", False) or record.name.startswith("pymongo") or record.name == __name__:
            return
        try:
            now = dt.datetime.now(dt.timezone.utc)
            doc = {
                "ts": now,
                "ts_expire": now,
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage()[:5000],
                "module": record.module,
                "func": record.funcName,
                "line": record.lineno,
            }
            if record.exc_info:
                doc["exception"] = "".join(traceback.format_exception(*record.exc_info))[-8000:]
            for k, v in vars(record).items():
                if k in _STD_ATTRS or k.startswith("_") or k in ("request", "sensitive"):
                    continue
                doc[k] = v if isinstance(v, (str, int, float, bool, type(None))) else str(v)
            req = getattr(record, "request", None)  # set by django.request on 4xx/5xx
            if req is not None:
                doc["http"] = {"method": getattr(req, "method", ""), "path": getattr(req, "path", "")}
            _enqueue("log", doc)
        except Exception:
            pass  # logging must never raise


# --- brainstorm documents ----------------------------------------------------------


def schedule_sync(session_id):
    """Queue a brainstorm for (re)syncing; repeated calls collapse into one write."""
    if session_id and settings.MONGODB_MIRROR_DOCUMENTS:
        _enqueue("session", str(session_id))


def build_document(s) -> dict:
    """Denormalised snapshot of an essay brainstorming session."""
    structure = getattr(s, "structure", None)
    user = s.user
    return {
        "_id": str(s.id),
        "user": {"id": str(user.id), "email": user.email, "name": user.first_name} if user else None,
        "student_name": s.student_name,
        "grade": s.grade,
        "college": s.college,
        "essay_title": s.essay_title,
        "prompt_text": s.prompt_text,
        "word_limit": s.word_limit,
        "status": s.status,
        "interview_summary": s.interview_summary,
        "transcript": [
            {"role": t.role, "text": t.text, "seq": t.seq, "stage": t.stage, "question": t.question, "at": t.created_at}
            for t in s.turns.all()
        ],
        "answers": [{"number": a.number, "text": a.text} for a in s.answers.all()],
        "structure": {"model": structure.model_name, "data": structure.data} if structure else None,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
        "synced_at": dt.datetime.now(dt.timezone.utc),
    }


def _sync_now(db, session_id: str):
    from django.db import close_old_connections

    from .models import BrainstormSession

    close_old_connections()
    s = (
        BrainstormSession.objects.select_related("user")
        .prefetch_related("turns", "answers")
        .filter(pk=session_id)
        .first()
    )
    if s is None:
        db.brainstorms.delete_one({"_id": session_id})
    else:
        db.brainstorms.replace_one({"_id": session_id}, build_document(s), upsert=True)
