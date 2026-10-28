"""OpenAI: Realtime (WebRTC) interviewer + Responses API essay strategist."""

import logging

import httpx
from django.conf import settings
from openai import OpenAI

from ..models import BrainstormSession
from ..prompts import STRATEGIST_INSTRUCTIONS, strategist_input, voice_setup
from .common import AIConfigError, StructureOut

log = logging.getLogger(__name__)


def _require_key():
    if not settings.OPENAI_API_KEY:
        raise AIConfigError("OPENAI_API_KEY is not set on the backend.")


def realtime_session_config(session: BrainstormSession) -> dict:
    instructions, tools = voice_setup(session)
    return {
        "type": "realtime",
        "model": settings.REALTIME_MODEL,
        "instructions": instructions,
        "output_modalities": ["audio"],
        "audio": {
            "input": {
                "transcription": {"model": settings.TRANSCRIBE_MODEL, "language": "en"},
                "noise_reduction": {"type": "near_field"},
                # Semantic VAD waits for the student to finish a thought rather
                # than cutting in on every pause.
                "turn_detection": {"type": "semantic_vad", "eagerness": "low"},
            },
            "output": {"voice": settings.REALTIME_VOICE},
        },
        "tools": [{"type": "function", **t} for t in tools],
        "tool_choice": "auto",
    }


def mint_voice_session(session: BrainstormSession) -> dict:
    """Ephemeral key for a WebRTC call; prompt, tools and voice are baked in."""
    _require_key()
    resp = httpx.post(
        f"{settings.OPENAI_BASE_URL}/realtime/client_secrets",
        headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
        json={
            "expires_after": {"anchor": "created_at", "seconds": 600},
            "session": realtime_session_config(session),
        },
        timeout=20,
    )
    if resp.status_code >= 400:
        log.error("client_secrets failed %s: %s", resp.status_code, resp.text)
        raise AIConfigError(f"OpenAI rejected the realtime session ({resp.status_code}): {resp.text[:300]}")
    data = resp.json()
    return {"token": data["value"], "model": settings.REALTIME_MODEL}


def generate_structure(session: BrainstormSession) -> tuple[dict, str]:
    _require_key()
    client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
    response = client.responses.parse(
        model=settings.LLM_MODEL,
        instructions=STRATEGIST_INSTRUCTIONS,
        input=strategist_input(session),
        text_format=StructureOut,
        reasoning={"effort": settings.LLM_REASONING_EFFORT},
    )
    if response.output_parsed is None:
        raise RuntimeError("The strategist returned no structured output.")
    return response.output_parsed.model_dump(), settings.LLM_MODEL
