"""Provider-independent pieces: the essay structure schema and word-budget maths."""

from pydantic import BaseModel, Field

from ..models import BrainstormSession


class AIConfigError(RuntimeError):
    pass


class Section(BaseModel):
    title: str = Field(description="Short label, e.g. 'Intro', 'The turning point', 'Why Bryn Mawr'")
    purpose: str = Field(description="What this section must accomplish for the reader")
    word_count: int
    guidance: str = Field(description="2–4 sentences to the student on what to write here and how")
    student_material: list[str] = Field(description="Specific details/phrases from the student to use here")


class StructureOut(BaseModel):
    working_title: str
    central_theme: str = Field(description="The one idea the reader should remember")
    thesis: str = Field(description="One sentence: experience → who they became → what they'll pursue")
    narrative_approach: str
    approach_rationale: str
    hook_options: list[str]
    sections: list[Section]
    college_connection: str
    tone_and_voice: str
    avoid: list[str]
    gaps_to_fill: list[str]


def rebalance_word_counts(sections: list[dict], limit: int) -> list[dict]:
    """Scale section budgets so they sum exactly to `limit` (largest remainder)."""
    if not sections:
        return sections
    raw = [max(1, int(s.get("word_count") or 1)) for s in sections]
    total = sum(raw)
    scaled = [r * limit / total for r in raw]
    floors = [int(x) for x in scaled]
    short = limit - sum(floors)
    by_remainder = sorted(range(len(scaled)), key=lambda i: scaled[i] - floors[i], reverse=True)
    for i in by_remainder[:short]:
        floors[i] += 1
    for s, wc in zip(sections, floors):
        s["word_count"] = wc
    return sections


def mock_structure(session: BrainstormSession) -> dict:
    first = next(iter(session.answers.all()), None)
    material = [first.text] if first else []
    sec = lambda title, purpose, wc: {  # noqa: E731
        "title": title,
        "purpose": purpose,
        "word_count": wc,
        "guidance": f"(mock) Think about {purpose.lower()}. Start with a specific memory.",
        "student_material": material,
    }
    return {
        "working_title": "(mock) Learning to let go",
        "central_theme": "(mock) Letting go made room to grow",
        "thesis": "(mock) thesis",
        "narrative_approach": "Challenge → growth arc",
        "approach_rationale": "(mock) STRATEGIST_MOCK is on — no LLM was called.",
        "hook_options": ["(mock) Open mid-scene."],
        "sections": [
            sec("Intro", "Drop the reader into the moment", 60),
            sec("The turning point", "What changed", 90),
            sec("Reflection", "Who you became", 80),
            sec(f"Why {session.college or 'this college'}", "The concrete next step", 70),
        ],
        "college_connection": "(mock)",
        "tone_and_voice": "(mock)",
        "avoid": ["(mock)"],
        "gaps_to_fill": ["(mock)"],
    }
