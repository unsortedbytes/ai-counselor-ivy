"""Deterministic topic guardrails, in front of the model's own prompt-level rules.

The voice model already refuses off-topic requests (see prompts.GUARDRAILS), but a
prompt can be talked around. These checks run on text we control — typed messages
and the answers / guidance the model saves — so injected or off-topic content never
reaches the strategist, the saved structure or the PDF report.

Patterns only match *requests* ("solve this", "ignore your instructions"), not topics,
so a student writing about the homework load that shaped them isn't blocked.
"""

import re

REDIRECT = "I can only help with your essay brainstorm, so let's stay on that."

_RULES: list[tuple[str, str]] = [
    (
        "injection",
        r"\b(ignore|disregard|forget|override)\b.{0,30}\b(instructions?|rules?|prompt|guidelines|above|previous)\b"
        r"|\bsystem\s+prompt\b|\bdeveloper\s+mode\b|\bjailbreak\b|\byou\s+are\s+now\b"
        r"|\b(pretend|act|behave|role-?play)\s+(to\s+be|as|like|you(\s+a|'re)?)\b"
        r"|\b(reveal|show|print|repeat)\b.{0,20}\b(instructions|prompt|rules)\b",
    ),
    ("ghostwriting", r"\b(write|draft|compose|generate)\b.{0,25}\b(my|the|this|an?)\s+(whole\s+|full\s+|entire\s+)?essay\b"),
    (
        "off_topic",
        r"\b(solve|calculate|integrate|differentiate)\b.{0,40}(\d|equation|problem|question)"
        r"|\b(write|fix|debug)\b.{0,20}\b(code|program|script|function|sql|python|javascript|java)\b"
        r"|\b(tell|give)\s+me\s+(a\s+)?(joke|riddle|poem|story)\b"
        r"|\b(weather|stock\s+price|cricket\s+score|ipl|bitcoin)\b.{0,20}\b(today|now|latest)\b"
        r"|\bwho\s+(won|will\s+win)\b|\bwhat'?s\s+the\s+capital\s+of\b",
    ),
]
_COMPILED = [(kind, re.compile(rx, re.IGNORECASE | re.DOTALL)) for kind, rx in _RULES]

MESSAGES = {
    "injection": "I'm Ivy, your essay coach, and I'll stick to that. Let's get back to your essay.",
    "ghostwriting": "I can't write the essay for you, but I'll help you find your story and plan every section.",
    "off_topic": REDIRECT,
}


def check(text: str) -> str | None:
    """Return the kind of violation ('injection', 'ghostwriting', 'off_topic'), or None."""
    for kind, rx in _COMPILED:
        if rx.search(text or ""):
            return kind
    return None


def is_injection(text: str) -> bool:
    return check(text) == "injection"
