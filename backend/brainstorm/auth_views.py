"""Email + password accounts on Django's built-in auth and session cookies."""

import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from .models import EmailOTP
from .views import BadRequest, api, required

log = logging.getLogger(__name__)

User = get_user_model()

MAX_FAILED_LOGINS = 5
LOCKOUT_SECONDS = 15 * 60

OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_SECONDS = 60
OTP_MAX_PER_HOUR = 5


def user_json(u) -> dict:
    return {"id": str(u.id), "email": u.email, "name": u.first_name or u.email.split("@")[0]}


def _clean_email(raw: str) -> str:
    email = raw.strip().lower()
    try:
        validate_email(email)
    except ValidationError:
        raise BadRequest("Enter a valid email address.")
    return email


@api("POST", public=True)
def register(request):
    name, email, password = required(request.json, "name", "email", "password")
    email = _clean_email(email)
    if User.objects.filter(username=email).exists():
        raise BadRequest("An account with this email already exists. Try logging in.")
    user = User(username=email, email=email, first_name=name[:150])
    try:
        validate_password(password, user)
    except ValidationError as e:
        raise BadRequest(" ".join(e.messages))
    user.set_password(password)
    user.save()
    login(request, user)
    log.info("user registered", extra={"event": "auth.register", "user_id": user.id, "email": email})
    return user_json(user), 201


@api("POST", public=True)
def login_view(request):
    email, password = required(request.json, "email", "password")
    email = email.strip().lower()
    # Throttle password guessing per account. (Behind the Next proxy every
    # request comes from the same IP, and X-Forwarded-For is client-spoofable.)
    key = f"login-fail:{email}"
    if cache.get(key, 0) >= MAX_FAILED_LOGINS:
        log.warning("login locked out", extra={"event": "auth.login_locked", "email": email})
        return {"error": "Too many failed attempts. Try again in 15 minutes."}, 429
    user = authenticate(request, username=email, password=password)
    if user is None:
        cache.set(key, cache.get(key, 0) + 1, LOCKOUT_SECONDS)
        log.warning("login failed", extra={"event": "auth.login_failed", "email": email})
        return {"error": "Incorrect email or password."}, 400
    cache.delete(key)
    login(request, user)  # rotates the session key (prevents fixation)
    log.info("login", extra={"event": "auth.login", "method": "password", "user_id": user.id, "email": email})
    return user_json(user)


@api("POST", public=True)
def logout_view(request):
    if request.user.is_authenticated:
        log.info("logout", extra={"event": "auth.logout", "user_id": request.user.id})
    logout(request)
    return {"ok": True}


@api("GET", public=True)
def auth_config(request):
    """What the login page should offer (Google needs a configured client ID)."""
    return {"google_client_id": settings.GOOGLE_CLIENT_ID or None}


@api("GET", public=True)
def me(request):
    return {"user": user_json(request.user) if request.user.is_authenticated else None}


def _sign_in(request, email: str, name: str = "", method: str = "otp"):
    """Log in the account for a verified email, creating it on first use.

    Accounts created by email code or Google have no password until the
    student sets one via "Forgot password".
    """
    user = User.objects.filter(username=email).first()
    if user is None:
        user = User(username=email, email=email, first_name=(name or email.split("@")[0])[:150])
        user.set_unusable_password()
        user.save()
    elif name and not user.first_name:
        user.first_name = name[:150]
        user.save(update_fields=["first_name"])
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    log.info("login", extra={"event": "auth.login", "method": method, "user_id": user.id, "email": email})
    return user


def _send(to: str, subject: str, body: str, dev_hint: str):
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)
    if not settings.EMAIL_HOST:
        # Dev mode prints emails encoded (quoted-printable); also log the
        # code/link verbatim so it can be copied from `docker compose logs`.
        log.info("[dev email to %s] %s", to, dev_hint, extra={"sensitive": True})  # never shipped to MongoDB


# --- Email one-time code -----------------------------------------------------

@api("POST", public=True)
def otp_request(request):
    (email,) = required(request.json, "email")
    email = _clean_email(email)
    now = timezone.now()
    recent = EmailOTP.objects.filter(email=email, created_at__gte=now - timedelta(hours=1))
    latest = recent.first()
    if latest and (now - latest.created_at).total_seconds() < OTP_RESEND_SECONDS:
        wait = OTP_RESEND_SECONDS - int((now - latest.created_at).total_seconds())
        return {"error": f"Please wait {wait}s before requesting another code."}, 429
    if recent.count() >= OTP_MAX_PER_HOUR:
        return {"error": "Too many codes requested. Try again in an hour."}, 429

    code = f"{secrets.randbelow(10**6):06d}"
    EmailOTP.objects.filter(email=email).delete()  # only the newest code is valid
    EmailOTP.objects.create(email=email, code_hash=make_password(code), expires_at=now + OTP_TTL)
    _send(
        email,
        f"{code} is your Ivy login code",
        f"Your Ivy login code is {code}\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.",
        dev_hint=f"login code: {code}",
    )
    log.info("login code sent", extra={"event": "auth.otp_sent", "email": email})
    # Same response whether or not an account exists, so emails can't be enumerated.
    return {"ok": True, "expires_in": int(OTP_TTL.total_seconds())}


@api("POST", public=True)
def otp_verify(request):
    email, code = required(request.json, "email", "code")
    email = email.strip().lower()
    otp = EmailOTP.objects.filter(email=email).first()
    if otp is None or otp.expires_at < timezone.now():
        raise BadRequest("That code has expired. Request a new one.")
    if otp.attempts >= OTP_MAX_ATTEMPTS:
        otp.delete()
        raise BadRequest("Too many wrong codes. Request a new one.")
    if not check_password(code.strip(), otp.code_hash):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        log.warning("wrong login code", extra={"event": "auth.otp_failed", "email": email, "attempt": otp.attempts})
        left = OTP_MAX_ATTEMPTS - otp.attempts
        raise BadRequest(f"Incorrect code. {left} attempt{'s' if left != 1 else ''} left.")
    otp.delete()
    user = _sign_in(request, email, str(request.json.get("name") or "").strip())
    return user_json(user)


# --- Forgot / reset password -------------------------------------------------

@api("POST", public=True)
def password_forgot(request):
    (email,) = required(request.json, "email")
    email = email.strip().lower()
    user = User.objects.filter(username=email, is_active=True).first()
    if user is not None:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
        _send(
            email,
            "Reset your Ivy password",
            f"Hi {user.first_name or ''},\n\nSet a new password here:\n{link}\n\n"
            "The link works once and expires in 3 days. If you didn't ask for this, ignore this email.",
            dev_hint=f"password reset link: {link}",
        )
    # Identical response either way, so the endpoint doesn't reveal who has an account.
    return {"ok": True}


@api("POST", public=True)
def password_reset(request):
    uid, token, password = required(request.json, "uid", "token", "password")
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)))
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        user = None
    # The token embeds the current password hash, so it stops working once used.
    if user is None or not default_token_generator.check_token(user, token):
        raise BadRequest("This reset link is invalid or has already been used.")
    try:
        validate_password(password, user)
    except ValidationError as e:
        raise BadRequest(" ".join(e.messages))
    user.set_password(password)
    user.save()
    cache.delete(f"login-fail:{user.username}")
    log.info("password reset", extra={"event": "auth.password_reset", "user_id": user.id})
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return user_json(user)


# --- Google sign-in ----------------------------------------------------------

def verify_google_credential(credential: str) -> dict:
    """Verify a Google Identity Services ID token (signature, audience, expiry)."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID)


@api("POST", public=True)
def google_login(request):
    if not settings.GOOGLE_CLIENT_ID:
        return {"error": "Google sign-in isn't configured on this server."}, 503
    (credential,) = required(request.json, "credential")
    try:
        info = verify_google_credential(credential)
    except ValueError as e:
        log.warning("rejected Google credential: %s", e)
        raise BadRequest("Google sign-in failed. Please try again.")
    if not info.get("email") or not info.get("email_verified"):
        raise BadRequest("Your Google account's email isn't verified.")
    user = _sign_in(request, info["email"].lower(), info.get("given_name") or info.get("name") or "", method="google")
    return user_json(user)
