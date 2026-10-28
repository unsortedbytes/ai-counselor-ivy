# helloivy — AI Essay Brainstorming

Ivy is an AI essay coach for students applying to college. The student **talks** to Ivy about one essay prompt. Ivy captures their answers to a set of focused questions, drafts a **word-budgeted essay structure** from them, refines it with the student section by section, and produces a final **essay structure report** they can download as a PDF.

Ivy never writes the essay — she helps the student find their story and organise it.

**Guardrails.** Ivy only talks about the student's essay. Her voice prompt tells her to refuse off-topic requests (homework, code, trivia, jokes), role-play and prompt-injection attempts, and to redirect to the essay in one line. On top of that, typed messages are screened server-side before they reach the model (`brainstorm/guard.py`), and injected instructions are never saved into answers or the structure, so they can't reach the strategist or the PDF report.

---

## How it works

1. **New Essay Brainstorming.** The student picks their college and an essay prompt (from the library, or pastes their own) and the word limit.
2. **Information Capture.** Ivy asks the prompt's questions one at a time by voice (typing works too). The panel shows *n/5 questions answered* and a timer; each of Ivy's questions is headed in the chat (e.g. *4. Professional*).
3. **Preview Answers.** The student checks — and can edit — what Ivy captured, then builds the structure.
4. **Draft structure.** The strategist model turns the answers into 3–6 sections (e.g. *Intro: 150 words*) whose budgets add up exactly to the word limit, each with guidance and the student's own material.
5. **Let's build the essay structure.** A second voice session: Ivy walks through the draft section by section and asks a question or two for each. The structure on the right updates live as she refines it.
6. **Review & Edit Structure.** The student edits titles, word budgets, guidance and material, reorders sections, and rebalances to the word limit.
7. **Essay Structure Report.** The final report page (theme, thesis, approach, section plan with word-budget bar, opening ideas, gaps to fill, and their answers) with **Download PDF**.

---

## Tech stack

| Part | Used |
|---|---|
| Voice AI | Gemini Live API (or OpenAI Realtime) |
| Structure AI | Gemini Flash (or OpenAI GPT) |
| PDF report | ReportLab |
| Backend | Django 6 |
| Frontend | Next.js + Tailwind |
| Database | MongoDB Atlas |
| Run | Docker Compose |

---

## Quick start

```bash
cp .env.example .env          # add GEMINI_API_KEY and MONGODB_URI
docker compose up --build
```

Open http://localhost:3000 in Chrome or Edge and allow microphone access.

Tip: set `STRATEGIST_MOCK=true` to get a sample essay structure without calling the AI.

---

## Project structure

```
backend/    Django API: accounts, sessions, voice tokens, essay structure, PDF report
frontend/   Next.js app: information capture, structure builder, review & edit, report
```

## Running tests

```bash
cd backend && python manage.py test brainstorm
```
