"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Answer, Session } from "@/lib/types";
import { mmss, useVoice } from "@/lib/useVoice";
import { AnswersPreview } from "./AnswersPreview";
import { ChatThread } from "./ChatThread";
import { InstructionsCard } from "./InstructionsCard";
import { VoiceBar } from "./VoiceBar";

const END_TOOLS = ["end_capture"];

/** Stage 1 — Information Capture: Ivy asks the essay's questions and saves each answer. */
export function CaptureRoom({ session, onFinalized }: { session: Session; onFinalized: () => void }) {
  const questions = session.questions ?? [];
  const [answers, setAnswers] = useState<Answer[]>(session.answers ?? []);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  // The question Ivy is on: 1 until an answer is saved, then the one after it.
  const current = useRef(session.current_question || 1);
  const summary = useRef("");
  // How many student turns had been heard at the last saved answer.
  const heardAtSave = useRef(0);

  const saveAnswer = useCallback(
    (number: number, text: string) => {
      setAnswers((prev) => [...prev.filter((a) => a.number !== number), { number, text }].sort((a, b) => a.number - b.number));
      return api.saveAnswer(session.id, number, text);
    },
    [session.id],
  );

  const finalize = async () => {
    setBusy(true);
    try {
      await voice.stop();
      await api.finalize(session.id, summary.current || undefined);
      onFinalized();
    } catch (e) {
      voice.setConn("error");
      voice.setError((e as Error).message);
      setBusy(false);
    }
  };

  const voice = useVoice({
    id: session.id,
    stage: "capture",
    initialTurns: (session.turns ?? []).filter((t) => t.stage === "capture"),
    endTools: END_TOOLS,
    currentQuestion: () => current.current,
    onTool: (name, args) => {
      const n = Number(args.number);
      if (name === "save_answer") {
        if (!(n >= 1 && n <= questions.length)) return { error: `question must be 1–${questions.length}` };
        // The model sometimes "answers" a question itself and races on to the next one.
        // Only accept a save once the student has said something since the last one.
        const heard = voice.turns.filter((t) => t.role === "user" && t.text).length;
        if (heard <= heardAtSave.current) {
          return { error: `The student hasn't answered yet. Ask question ${n} and wait for their reply before saving.` };
        }
        heardAtSave.current = heard;
        voice.track(saveAnswer(n, String(args.answer ?? "")));
        const next = Math.min(n + 1, questions.length);
        if (next > current.current) {
          current.current = next;
          voice.track(api.setQuestion(session.id, next));
        }
        return { result: "saved" };
      }
      if (name === "end_capture") {
        summary.current = String(args.summary ?? "");
        return { result: "ok" };
      }
      return { error: `unknown tool ${name}` };
    },
    // Ivy said goodbye: build the structure straight away.
    onEnd: () => finalize(),
  });

  const hasUserTurns = voice.turns.some((t) => t.role === "user" && t.text);
  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6">
      <InstructionsCard
        items={[
          "This is a short, focused voice session with Ivy (about 10 minutes).",
          "This session will take your stories and shape them into a strong essay structure with Ivy's support.",
          `Ivy will ask you ${questions.length} questions about your essay, one at a time. Answer out loud, or type if you prefer.`,
          "Specific memories and details matter more than polished answers — there are no wrong ones.",
          "When you're done, click Preview Answers to check what Ivy captured before building your essay structure.",
        ]}
      />

      <section className="gradient-card flex h-[68vh] min-h-[480px] flex-col overflow-hidden rounded-2xl shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 text-sm">
          <h2 className="font-semibold text-navy-900">Information Capture</h2>
          <span className="h-4 w-px bg-slate-300" />
          <span className="text-slate-500">
            {answers.length}/{questions.length} question{questions.length === 1 ? "" : "s"} answered
          </span>
          <span className="ml-auto flex items-center gap-1.5 font-medium text-navy-900">
            <HourglassIcon /> {mmss(voice.elapsed)} mins
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <ChatThread
            turns={voice.turns}
            studentName={session.student_name}
            questions={questions}
            empty="Press “Start talking to Ivy” — she'll greet you and ask the first question."
          />
        </div>
        <VoiceBar voice={voice} hasTurns={voice.turns.length > 0} idleHint="Ready when you are" />
      </section>

      <div className="flex justify-end">
        <button onClick={() => setPreview(true)} disabled={!answers.length && !hasUserTurns} className="btn-primary text-sm">
          Preview Answers <span aria-hidden>→</span>
        </button>
      </div>

      {preview && (
        <AnswersPreview
          questions={questions}
          answers={answers}
          busy={busy}
          onSave={saveAnswer}
          onClose={() => setPreview(false)}
          onContinue={finalize}
        />
      )}
    </main>
  );
}

export function HourglassIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
