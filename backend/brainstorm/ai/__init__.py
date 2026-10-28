"""AI provider facade.

The interviewer (speech-to-speech) and the strategist (reasoning LLM) can run
on Gemini or OpenAI; `settings.AI_PROVIDER` picks one. Views only talk to the
functions below.
"""

from django.conf import settings

from ..models import BrainstormSession
from .common import AIConfigError, mock_structure, rebalance_word_counts

__all__ = ["AIConfigError", "mint_voice_session", "generate_structure", "rebalance_word_counts"]


def _provider():
    if settings.AI_PROVIDER == "openai":
        from . import openai_provider as p
    elif settings.AI_PROVIDER == "gemini":
        from . import gemini_provider as p
    else:
        raise AIConfigError(f"Unknown AI_PROVIDER {settings.AI_PROVIDER!r}")
    return p


def mint_voice_session(session: BrainstormSession) -> dict:
    """Short-lived credentials the browser uses to talk to the voice model directly."""
    return {"provider": settings.AI_PROVIDER, **_provider().mint_voice_session(session)}


def generate_structure(session: BrainstormSession) -> tuple[dict, str]:
    """The draft essay structure, with section budgets summing to the word limit."""
    if settings.STRATEGIST_MOCK:
        data, model = mock_structure(session), "mock"
    else:
        data, model = _provider().generate_structure(session)
    data["sections"] = rebalance_word_counts(data["sections"], session.word_limit)
    return data, model
