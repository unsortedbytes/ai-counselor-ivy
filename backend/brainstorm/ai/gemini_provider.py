"""Gemini: Live API (WebSocket) interviewer + structured-output essay strategist."""

import datetime as dt
import logging
import time

from django.conf import settings
from google import genai
from google.genai import errors, types

from ..models import BrainstormSession
from ..prompts import STRATEGIST_INSTRUCTIONS, strategist_input, voice_setup
from .common import AIConfigError, StructureOut

log = logging.getLogger(__name__)

# Ephemeral tokens only work against the "Constrained" Live endpoint.
LIVE_WS_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained"
)


def _client(retries: bool = True) -> genai.Client:
    if not settings.GEMINI_API_KEY:
        raise AIConfigError("GEMINI_API_KEY is not set on the backend.")
    # Without retries a quota error (429) fails fast instead of backing off for minutes.
    http = None if retries else types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1))
    return genai.Client(api_key=settings.GEMINI_API_KEY, http_options=http)


# Gemini returns these when a model is overloaded or the quota window is full.
TRANSIENT = {429, 500, 503, 504}


def _generate(contents, config: types.GenerateContentConfig, model: str | None = None, attempts: int = 3):
    """generate_content with backoff on transient errors, then fallback models.

    Free-tier Flash models regularly answer 503 "high demand" for a minute or
    two; one failed call shouldn't fail a student's whole report.
    """
    models = [model or settings.GEMINI_STRATEGY_MODEL] + [
        m for m in settings.GEMINI_FALLBACK_MODELS if m != (model or settings.GEMINI_STRATEGY_MODEL)
    ]
    client = _client(retries=False)
    last: Exception | None = None
    for m in models:
        for attempt in range(attempts):
            try:
                t0 = time.monotonic()
                response = client.models.generate_content(model=m, contents=contents, config=config)
                log.info("gemini call ok", extra={"event": "ai.call", "ok": True, "model": m, "attempt": attempt + 1,
                                                  "fallback": m != models[0], "seconds": round(time.monotonic() - t0, 1)})
                return response, m
            except errors.APIError as e:
                if e.code not in TRANSIENT:
                    raise
                last = e
                log.warning("%s attempt %d failed with %s; retrying", m, attempt + 1, e.code,
                            extra={"event": "ai.call", "ok": False, "model": m, "attempt": attempt + 1, "status": e.code})
                if attempt + 1 < attempts:
                    time.sleep(4 * 3**attempt)  # 4s, 12s
    raise last  # every model and retry exhausted


def _thinking():
    level = settings.GEMINI_THINKING_LEVEL
    return types.ThinkingConfig(thinking_level=level) if level else None


def live_config(session: BrainstormSession) -> types.LiveConnectConfig:
    instructions, tools = voice_setup(session)
    return types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        system_instruction=instructions,
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=settings.GEMINI_VOICE)
            )
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        # Keeps long interviews inside the context window.
        context_window_compression=types.ContextWindowCompressionConfig(sliding_window=types.SlidingWindow()),
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                # Students pause mid-thought; don't treat every breath as end-of-turn.
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                silence_duration_ms=900,
            )
        ),
        tools=[
            types.Tool(
                function_declarations=[
                    types.FunctionDeclaration(
                        name=t["name"],
                        description=t["description"],
                        parameters_json_schema=t["parameters"],
                    )
                    for t in tools
                ]
            )
        ],
    )


def mint_voice_session(session: BrainstormSession) -> dict:
    """Single-use token whose Live config (prompt, tools, voice) is locked server-side."""
    client = _client()
    now = dt.datetime.now(tz=dt.timezone.utc)
    try:
        token = client.auth_tokens.create(
            config=types.CreateAuthTokenConfig(
                uses=1,
                expire_time=now + dt.timedelta(minutes=30),
                new_session_expire_time=now + dt.timedelta(minutes=2),
                live_connect_constraints=types.LiveConnectConstraints(
                    model=settings.GEMINI_LIVE_MODEL,
                    config=live_config(session),
                ),
                # Lock only what we set (prompt, tools, voice…). The browser may
                # still add `sessionResumption` to transparently reconnect when
                # Gemini recycles the socket (~every 10 min) — same token.
                lock_additional_fields=[],
            )
        )
    except Exception as e:
        log.exception("Gemini auth token creation failed")
        raise AIConfigError(f"Gemini rejected the live session: {e}") from e
    return {"token": token.name, "model": settings.GEMINI_LIVE_MODEL, "ws_url": LIVE_WS_URL}


def generate_structure(session: BrainstormSession) -> tuple[dict, str]:
    response, model = _generate(
        strategist_input(session),
        types.GenerateContentConfig(
            system_instruction=STRATEGIST_INSTRUCTIONS,
            response_mime_type="application/json",
            response_schema=StructureOut,
            thinking_config=_thinking(),
        ),
    )
    if response.parsed is None:
        raise RuntimeError(f"The strategist returned no structured output: {response.text[:300]!r}")
    return response.parsed.model_dump(), model
