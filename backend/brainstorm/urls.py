# No trailing slashes: the Next.js dev proxy strips them, and Django's
# APPEND_SLASH redirect can't carry a POST body.
from django.urls import path

from . import auth_views, views

urlpatterns = [
    path("health", views.health),
    path("auth/register", auth_views.register),
    path("auth/login", auth_views.login_view),
    path("auth/logout", auth_views.logout_view),
    path("auth/me", auth_views.me),
    path("auth/config", auth_views.auth_config),
    path("auth/otp/request", auth_views.otp_request),
    path("auth/otp/verify", auth_views.otp_verify),
    path("auth/password/forgot", auth_views.password_forgot),
    path("auth/password/reset", auth_views.password_reset),
    path("auth/google", auth_views.google_login),
    path("prompts", views.prompts),
    path("guard", views.check_message),
    path("sessions", views.sessions),
    path("sessions/<uuid:pk>", views.session_detail),
    path("sessions/<uuid:pk>/realtime", views.realtime_token),
    path("sessions/<uuid:pk>/turns", views.add_turn),
    path("sessions/<uuid:pk>/question", views.set_question),
    path("sessions/<uuid:pk>/answers", views.save_answer),
    path("sessions/<uuid:pk>/finalize", views.finalize),
    path("sessions/<uuid:pk>/structure", views.structure),
    path("sessions/<uuid:pk>/structure/sections/<int:number>", views.update_section),
    path("sessions/<uuid:pk>/complete", views.complete),
    path("sessions/<uuid:pk>/report.pdf", views.report_pdf),
]
