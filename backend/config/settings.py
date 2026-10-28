"""Django settings for the Essay Brainstorming backend.

All data lives in MongoDB (Atlas) via django-mongodb-backend; everything
environment-specific is read from env vars.
"""

import os
from pathlib import Path

import sys

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
TESTING = "test" in sys.argv[1:2]


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")
CSRF_TRUSTED_ORIGINS = [
    o for o in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:3000").split(",") if o
]

INSTALLED_APPS = [
    # Django's own apps, re-configured for MongoDB ObjectId primary keys.
    "config.apps.MongoAdminConfig",
    "config.apps.MongoAuthConfig",
    "config.apps.MongoContentTypesConfig",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django_mongodb_backend",
    "brainstorm",
]

# Migrations for the built-in apps, regenerated with ObjectIdAutoField.
MIGRATION_MODULES = {
    "admin": "mongo_migrations.admin",
    "auth": "mongo_migrations.auth",
    "contenttypes": "mongo_migrations.contenttypes",
}

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --- MongoDB Atlas: the only database (data + logs) ---------------------------
MONGODB_URI = os.environ.get("MONGODB_URI", "")
MONGODB_DB = os.environ.get("MONGODB_DB", "ivy")
if not MONGODB_URI:
    raise ImproperlyConfigured("Set MONGODB_URI (your MongoDB Atlas connection string) in .env")

DATABASES = {
    "default": {
        "ENGINE": "django_mongodb_backend",
        "HOST": MONGODB_URI,
        "NAME": MONGODB_DB,
        "OPTIONS": {"appname": "ivy-brainstormer"},
        # Tests get their own database on the same cluster (dropped afterwards).
        "TEST": {"NAME": f"{MONGODB_DB}_test"},
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Session cookie auth. The browser only talks to Next.js, which proxies /api to
# Django, so the cookie is first-party. Lax keeps it off cross-site POSTs.
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", False)  # true when served over HTTPS
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14
# Behind an HTTPS proxy (Render, Caddy…), trust its scheme header so Django
# knows the request was secure.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Public URL of the Next.js app, used in password-reset links.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")

# Google sign-in: OAuth 2.0 *Web* client ID (Google Cloud Console → Credentials).
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

# Email for login codes and password resets. Without SMTP settings, emails are
# printed to the backend log (handy in development: `docker compose logs backend`).
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_HOST
    else "django.core.mail.backends.console.EmailBackend"
)
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "Ivy <no-reply@ivy.local>")

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django_mongodb_backend.fields.ObjectIdAutoField"

# --- Logs (and optional one-document-per-brainstorm view) in the same cluster ---
# See brainstorm/mongo.py. The denormalised `brainstorms` view duplicates data
# that already lives in MongoDB, so it's opt-in.
MONGODB_MIRROR_DOCUMENTS = env_bool("MONGODB_MIRROR_DOCUMENTS", False)
# Ship logs to Atlas — never from the test suite, which must not touch real logs.
MONGODB_LOGS = env_bool("MONGODB_LOGS", not TESTING)
MONGODB_LOG_LEVEL = os.environ.get("MONGODB_LOG_LEVEL", "INFO")
MONGODB_LOG_TTL_DAYS = int(os.environ.get("MONGODB_LOG_TTL_DAYS", "30"))

_log_handlers = ["console"] + (["mongo"] if MONGODB_LOGS else [])
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
        "mongo": {"class": "brainstorm.mongo.MongoLogHandler", "level": MONGODB_LOG_LEVEL},
    },
    "loggers": {
        "brainstorm": {"handlers": _log_handlers, "level": "INFO", "propagate": False},
        # 4xx/5xx responses and security warnings (e.g. bad Host headers).
        "django.request": {"handlers": _log_handlers, "level": "WARNING", "propagate": False},
        "django.security": {"handlers": _log_handlers, "level": "WARNING", "propagate": False},
    },
}

# --- AI configuration -------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_LIVE_MODEL = os.environ.get("GEMINI_LIVE_MODEL", "gemini-3.8-live")
GEMINI_VOICE = os.environ.get("GEMINI_VOICE", "Aoede")
# Pro models have no free-tier quota; Flash is plenty for this task.
GEMINI_STRATEGY_MODEL = os.environ.get("GEMINI_STRATEGY_MODEL", "gemini-3.8-flash")
GEMINI_THINKING_LEVEL = os.environ.get("GEMINI_THINKING_LEVEL", "")  # minimal/low/medium/high; "" = model default
# Tried in order when the main model is overloaded (503) or rate-limited (429).
GEMINI_FALLBACK_MODELS = [m for m in os.environ.get("GEMINI_FALLBACK_MODELS", "gemini-3.5-flash").split(",") if m]

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")

# Speech-to-speech interviewer (browser <-> OpenAI over WebRTC).
REALTIME_MODEL = os.environ.get("REALTIME_MODEL", "gpt-realtime-1.5")
REALTIME_VOICE = os.environ.get("REALTIME_VOICE", "marin")
TRANSCRIBE_MODEL = os.environ.get("TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe")

# Reasoning model that turns the answers into the essay structure.
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-5.4")
LLM_REASONING_EFFORT = os.environ.get("LLM_REASONING_EFFORT", "medium")

# "gemini" or "openai"; defaults to whichever key is configured.
AI_PROVIDER = os.environ.get("AI_PROVIDER") or ("gemini" if GEMINI_API_KEY or not OPENAI_API_KEY else "openai")

# Dev only: produce a canned essay structure instead of calling the LLM.
STRATEGIST_MOCK = env_bool("STRATEGIST_MOCK", False)
