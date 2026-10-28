"""The final essay-structure report as a downloadable PDF."""

import io
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import BrainstormSession

NAVY = colors.HexColor("#0f1b3d")
BLUE = colors.HexColor("#2f6bff")
MUTED = colors.HexColor("#5b6478")
LINE = colors.HexColor("#dfe3f0")
TINT = colors.HexColor("#f3f5ff")

_base = getSampleStyleSheet()
STYLES = {
    "brand": ParagraphStyle("brand", parent=_base["Normal"], fontName="Helvetica-Bold", fontSize=11, textColor=BLUE),
    "title": ParagraphStyle("title", parent=_base["Title"], fontSize=20, leading=24, textColor=NAVY, alignment=TA_LEFT, spaceAfter=2),
    "meta": ParagraphStyle("meta", parent=_base["Normal"], fontSize=9.5, leading=13, textColor=MUTED),
    "h2": ParagraphStyle("h2", parent=_base["Heading2"], fontSize=13, leading=16, textColor=NAVY, spaceBefore=12, spaceAfter=6),
    "h3": ParagraphStyle("h3", parent=_base["Heading3"], fontSize=11, leading=14, textColor=NAVY, spaceBefore=2, spaceAfter=2),
    "body": ParagraphStyle("body", parent=_base["Normal"], fontSize=10, leading=14.5, textColor=NAVY),
    "small": ParagraphStyle("small", parent=_base["Normal"], fontSize=9, leading=13, textColor=MUTED),
    "bullet": ParagraphStyle("bullet", parent=_base["Normal"], fontSize=10, leading=14, textColor=NAVY, leftIndent=12, bulletIndent=2),
}


def _p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(escape(str(text or "")).replace("\n", "<br/>"), STYLES[style])


def _bullets(items) -> list:
    return [Paragraph(escape(str(i)), STYLES["bullet"], bulletText="•") for i in items or []]


def _labelled(label: str, text: str) -> Paragraph:
    return Paragraph(f"<b>{escape(label)}</b> {escape(str(text or ''))}", STYLES["body"])


def render_pdf(s: BrainstormSession) -> bytes:
    data = s.structure.data
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Essay structure — {s.essay_title}", author="helloivy",
    )
    college = s.college or "your college"
    story = [
        _p("helloivy · Essay Brainstorming", "brand"),
        Spacer(1, 4),
        _p(data.get("working_title") or s.essay_title, "title"),
        _p(f"{s.student_name}{' · ' + s.grade if s.grade else ''} · {college} · {s.essay_title} · "
           f"{s.word_limit} words · {timezone.localdate():%d %b %Y}", "meta"),
        Spacer(1, 8),
    ]

    prompt = Table([[_p(s.prompt_text.replace("(this college)", college), "body")]], colWidths=[doc.width])
    prompt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TINT),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [_p("Essay prompt", "h3"), prompt]

    story += [
        _p("The big idea", "h2"),
        _labelled("Central theme:", data.get("central_theme")),
        Spacer(1, 3),
        _labelled("Thesis:", data.get("thesis")),
        Spacer(1, 3),
        _labelled("Approach:", f"{data.get('narrative_approach', '')}. {data.get('approach_rationale', '')}"),
    ]

    story.append(_p("Essay structure", "h2"))
    sections = data.get("sections", [])
    total = sum(int(x.get("word_count") or 0) for x in sections)
    story.append(_p(f"{len(sections)} sections · {total} of {s.word_limit} words", "small"))
    story.append(Spacer(1, 6))
    for n, sec in enumerate(sections, 1):
        block = [_p(f"{n}. {sec.get('title')}: {sec.get('word_count')} words", "h3")]
        if sec.get("purpose"):
            block.append(_p(sec["purpose"], "small"))
        block.append(Spacer(1, 2))
        block.append(_p(sec.get("guidance")))
        if sec.get("student_material"):
            block.append(Spacer(1, 3))
            block.append(_p("Your material", "small"))
            block += _bullets(sec["student_material"])
        cell = Table([[block]], colWidths=[doc.width])
        cell.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.6, LINE),
            ("LINEBEFORE", (0, 0), (0, -1), 2.5, BLUE),
            ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story += [KeepTogether(cell), Spacer(1, 6)]

    for heading, key in (("Opening ideas", "hook_options"), ("Watch out for", "avoid"), ("Gaps to fill before you write", "gaps_to_fill")):
        if data.get(key):
            story += [_p(heading, "h2"), *_bullets(data[key])]
    if data.get("college_connection"):
        story += [_p(f"Connecting to {college}", "h2"), _p(data["college_connection"])]
    if data.get("tone_and_voice"):
        story += [_p("Tone & voice", "h2"), _p(data["tone_and_voice"])]

    answers = {a.number: a.text for a in s.answers.all()}
    if answers:
        story.append(_p("Your brainstorming answers", "h2"))
        for n, q in enumerate(s.questions, 1):
            story.append(KeepTogether([
                _p(f"{n}. {q['label']}", "h3"),
                _p(q["question"], "small"),
                _p(answers.get(n, "Not answered.")),
                Spacer(1, 5),
            ]))

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(doc.leftMargin, 9 * mm, "Generated by Ivy, your AI essay coach. Write the essay in your own words.")
        canvas.drawRightString(A4[0] - doc.rightMargin, 9 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
